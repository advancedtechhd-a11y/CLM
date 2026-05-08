/**
 * Shopify webhook receiver — handles all topics we subscribe to.
 *
 * Flow:
 *   1. Verify HMAC signature (rejects forged events)
 *   2. Look up merchant by shop domain
 *   3. Persist raw event to webhook_events (audit trail)
 *   4. Process the event (update DB)
 *   5. Return 200 quickly — Shopify retries if not 200 within 5 seconds
 *
 * EMIT PLACEMENT NOTE (v1.5 Phase 5):
 *   The Recent Activity widget's events are emitted from the four spots
 *   marked `// Emit:` below. Three considerations if/when this file is
 *   refactored to a queue-based async pattern:
 *
 *     a) Move the four emit calls into the queue worker — events should
 *        fire AFTER the upsert succeeds, never before.
 *     b) Keep the dedupe_key pattern (`${event_type}:${entity_id}`) so
 *        retries from Shopify still dedupe at the events layer.
 *     c) Preserve fire-and-forget semantics: emitEvent never throws, but
 *        callers must still try/catch defensively. Events are NEVER in
 *        the critical path of order processing.
 *
 *   Initial sync (lib/shopify/sync.ts) deliberately does NOT emit — those
 *   are historical orders being backfilled, not live activity.
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { verifyWebhookHmac } from "@/lib/shopify/oauth";
import type { WebhookTopic } from "@/lib/shopify/webhooks";
import { extractCustomerGeo } from "@/lib/shopify/sync";
import { emitEvent } from "@/lib/events/emit";
import { EVENT_TYPES } from "@/lib/events/types";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ topic: string[] }> }
) {
  const { topic: topicParts } = await params;
  const topic = topicParts.join("/") as WebhookTopic;

  // 1. Verify HMAC ─────────────────────────────────────────
  const hmacHeader = req.headers.get("x-shopify-hmac-sha256");
  const shop = req.headers.get("x-shopify-shop-domain");
  const rawBody = await req.text();

  if (!hmacHeader || !shop) {
    console.warn(`[webhook ${topic}] missing required Shopify headers`);
    return new NextResponse("Bad Request", { status: 400 });
  }
  if (!verifyWebhookHmac(rawBody, hmacHeader)) {
    console.warn(`[webhook ${topic}] HMAC verification FAILED for ${shop}`);
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 2. Look up merchant ────────────────────────────────────
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const merchantRes = await pg.query<{ id: string }>(
      "SELECT id FROM public.merchants WHERE shop_domain = $1",
      [shop]
    );
    if (merchantRes.rows.length === 0) {
      // Webhook for an unknown shop — likely a stale uninstall. Acknowledge so Shopify stops retrying.
      console.warn(`[webhook ${topic}] no merchant found for ${shop}`);
      return new NextResponse("OK", { status: 200 });
    }
    const merchantId = merchantRes.rows[0].id;

    // 3. Persist raw event (audit trail) ────────────────────
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = { raw: rawBody };
    }
    const externalId = payload?.id ? String(payload.id) : null;
    const eventInsert = await pg.query<{ id: string }>(
      `
      INSERT INTO public.webhook_events
        (merchant_id, platform, event_type, external_id, payload, hmac_verified, received_at)
      VALUES ($1, 'shopify', $2, $3, $4::jsonb, true, NOW())
      RETURNING id
      `,
      [merchantId, topic, externalId, JSON.stringify(payload)]
    );
    const eventId = eventInsert.rows[0].id;

    // 4. Process by topic ──────────────────────────────────
    try {
      await processWebhook(pg, merchantId, topic, payload);
      await pg.query(
        "UPDATE public.webhook_events SET processed_at = NOW() WHERE id = $1",
        [eventId]
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[webhook ${topic}] processing failed for ${shop}:`, errMsg);
      await pg.query(
        "UPDATE public.webhook_events SET error = $2 WHERE id = $1",
        [eventId, errMsg]
      );
      // We still return 200 — the event is persisted. Failed processing can be retried offline.
    }

    return new NextResponse("OK", { status: 200 });
  } finally {
    await pg.end();
  }
}

// ─────────────────────────────────────────────────────────
// Event processing
// ─────────────────────────────────────────────────────────

async function processWebhook(
  pg: Client,
  merchantId: string,
  topic: WebhookTopic,
  payload: any
): Promise<void> {
  switch (topic) {
    case "orders/create": {
      await upsertOrderFromWebhook(pg, merchantId, payload);

      // Emit: order.created OR order.first. Shopify's payload.customer.orders_count
      // is the merchant's order count INCLUDING this one — so === 1 means first.
      // dedupe_key prevents double-emission on Shopify's webhook retries.
      try {
        const isFirst = payload.customer?.orders_count === 1;
        const eventType = isFirst
          ? EVENT_TYPES.ORDER_FIRST
          : EVENT_TYPES.ORDER_CREATED;
        const orderId = String(payload.id);
        await emitEvent(pg, {
          merchantId,
          eventType,
          entityType: "order",
          entityId: orderId,
          dedupeKey: `${eventType}:${orderId}`,
          payload: {
            customer_name: customerName(payload.customer),
            customer_email: payload.customer?.email ?? null,
            total: parseFloat(payload.total_price ?? "0"),
            currency: payload.currency ?? "USD",
            order_number: payload.order_number ? String(payload.order_number) : null,
          },
        });
      } catch {
        /* never blocks order processing — emitEvent already swallows errors */
      }

      // If this order matches an abandoned checkout, mark it recovered.
      // Internal logic emits cart.recovered iff the UPDATE matched a row.
      await markCheckoutRecoveredIfMatch(pg, merchantId, payload);
      break;
    }
    case "orders/updated":
      // No emit on update — already in feed from orders/create
      await upsertOrderFromWebhook(pg, merchantId, payload);
      break;
    case "orders/cancelled":
      await markOrderCancelled(pg, merchantId, payload);
      break;
    case "customers/create":
    case "customers/update":
      // No customer.* emits in v1.5 — see EMIT PLACEMENT NOTE at top of file.
      await upsertCustomerFromWebhook(pg, merchantId, payload);
      break;
    case "checkouts/create": {
      await upsertAbandonedCheckoutFromWebhook(pg, merchantId, payload);

      // Emit: cart.abandoned. Note semantic stretch — Shopify fires this on
      // every checkout-start, not only abandonments. The dedupe_key on the
      // checkout's external_id means each cart only ever appears once in
      // the feed; if it gets recovered, a cart.recovered event lands later.
      try {
        const externalId = String(payload.id ?? payload.token ?? "");
        if (externalId) {
          await emitEvent(pg, {
            merchantId,
            eventType: EVENT_TYPES.CART_ABANDONED,
            entityType: "cart",
            entityId: externalId,
            dedupeKey: `${EVENT_TYPES.CART_ABANDONED}:${externalId}`,
            payload: {
              customer_name: customerName(payload.customer),
              customer_email: payload.email ?? payload.customer?.email ?? null,
              total: parseFloat(payload.total_price ?? "0"),
              currency: payload.currency ?? "USD",
            },
          });
        }
      } catch {
        /* never blocks */
      }
      break;
    }
    case "checkouts/update":
      // No emit on update — dedupe_key on the create-time emit handles it
      await upsertAbandonedCheckoutFromWebhook(pg, merchantId, payload);
      break;
    case "app/uninstalled":
      await markMerchantUninstalled(pg, merchantId);
      break;
    default:
      console.warn(`[webhook] unhandled topic: ${topic}`);
  }
}

/** Build a display name from a Shopify customer payload, falling back to email or "A customer". */
function customerName(customer: any): string {
  if (!customer) return "A customer";
  const parts = [customer.first_name, customer.last_name].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  if (customer.email) return customer.email;
  return "A customer";
}

async function upsertCustomerFromWebhook(pg: Client, merchantId: string, payload: any): Promise<void> {
  if (!payload?.id) return;
  const geo = extractCustomerGeo(payload);
  await pg.query(
    `
    INSERT INTO public.customers
      (merchant_id, external_id, email, phone, first_name, last_name,
       total_spent, orders_count, email_marketing_consent, sms_marketing_consent,
       first_order_at, last_order_at,
       country_code, country_name, region, city)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (merchant_id, external_id) DO UPDATE SET
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      total_spent = EXCLUDED.total_spent,
      orders_count = EXCLUDED.orders_count,
      email_marketing_consent = EXCLUDED.email_marketing_consent,
      sms_marketing_consent = EXCLUDED.sms_marketing_consent,
      first_order_at = COALESCE(EXCLUDED.first_order_at, public.customers.first_order_at),
      last_order_at = COALESCE(EXCLUDED.last_order_at, public.customers.last_order_at),
      country_code = COALESCE(EXCLUDED.country_code, public.customers.country_code),
      country_name = COALESCE(EXCLUDED.country_name, public.customers.country_name),
      region       = COALESCE(EXCLUDED.region,       public.customers.region),
      city         = COALESCE(EXCLUDED.city,         public.customers.city)
    `,
    [
      merchantId,
      String(payload.id),
      payload.email ?? null,
      payload.phone ?? null,
      payload.first_name ?? null,
      payload.last_name ?? null,
      parseFloat(payload.total_spent ?? "0"),
      payload.orders_count ?? 0,
      payload.email_marketing_consent?.state === "subscribed",
      payload.sms_marketing_consent?.state === "subscribed",
      payload.first_order_at ?? null,
      payload.last_order_at ?? null,
      geo.country_code,
      geo.country_name,
      geo.region,
      geo.city,
    ]
  );
}

async function upsertOrderFromWebhook(pg: Client, merchantId: string, payload: any): Promise<void> {
  if (!payload?.id) return;

  // Resolve customer_id (must exist in customers table)
  let customerId: string | null = null;
  if (payload.customer?.id) {
    const customerRes = await pg.query<{ id: string }>(
      "SELECT id FROM public.customers WHERE merchant_id = $1 AND external_id = $2",
      [merchantId, String(payload.customer.id)]
    );
    customerId = customerRes.rows[0]?.id ?? null;
    // If customer doesn't exist yet (rare), upsert them first
    if (!customerId) {
      await upsertCustomerFromWebhook(pg, merchantId, payload.customer);
      const retry = await pg.query<{ id: string }>(
        "SELECT id FROM public.customers WHERE merchant_id = $1 AND external_id = $2",
        [merchantId, String(payload.customer.id)]
      );
      customerId = retry.rows[0]?.id ?? null;
    }
  }

  await pg.query(
    `
    INSERT INTO public.orders
      (merchant_id, customer_id, external_id, ordered_at, order_total, subtotal,
       discount_total, financial_status, fulfillment_status, currency)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (merchant_id, external_id) DO UPDATE SET
      order_total = EXCLUDED.order_total,
      subtotal = EXCLUDED.subtotal,
      discount_total = EXCLUDED.discount_total,
      financial_status = EXCLUDED.financial_status,
      fulfillment_status = EXCLUDED.fulfillment_status,
      synced_at = NOW()
    `,
    [
      merchantId,
      customerId,
      String(payload.id),
      payload.created_at ?? new Date().toISOString(),
      parseFloat(payload.total_price ?? "0"),
      parseFloat(payload.subtotal_price ?? "0"),
      parseFloat(payload.total_discounts ?? "0"),
      payload.financial_status ?? null,
      payload.fulfillment_status ?? null,
      payload.currency ?? "USD",
    ]
  );
}

async function markOrderCancelled(pg: Client, merchantId: string, payload: any): Promise<void> {
  if (!payload?.id) return;
  await pg.query(
    `
    UPDATE public.orders
    SET financial_status = 'voided', updated_at = NOW()
    WHERE merchant_id = $1 AND external_id = $2
    `,
    [merchantId, String(payload.id)]
  );
}

async function upsertAbandonedCheckoutFromWebhook(pg: Client, merchantId: string, payload: any): Promise<void> {
  if (!payload?.id && !payload?.token) return;
  const externalId = String(payload.id ?? payload.token);

  // Try to resolve customer_id from payload
  let customerId: string | null = null;
  if (payload.customer?.id) {
    const r = await pg.query<{ id: string }>(
      "SELECT id FROM public.customers WHERE merchant_id = $1 AND external_id = $2",
      [merchantId, String(payload.customer.id)]
    );
    customerId = r.rows[0]?.id ?? null;
  }

  await pg.query(
    `
    INSERT INTO public.abandoned_checkouts
      (merchant_id, customer_id, external_id, email, total_price, subtotal_price, currency,
       line_items, abandoned_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW(), NOW())
    ON CONFLICT (merchant_id, external_id) DO UPDATE SET
      customer_id = COALESCE(EXCLUDED.customer_id, public.abandoned_checkouts.customer_id),
      email = COALESCE(EXCLUDED.email, public.abandoned_checkouts.email),
      total_price = EXCLUDED.total_price,
      subtotal_price = EXCLUDED.subtotal_price,
      line_items = EXCLUDED.line_items,
      abandoned_at = NOW(),
      updated_at = NOW()
    `,
    [
      merchantId,
      customerId,
      externalId,
      payload.email ?? null,
      parseFloat(payload.total_price ?? "0"),
      parseFloat(payload.subtotal_price ?? "0"),
      payload.currency ?? "USD",
      JSON.stringify(payload.line_items ?? []),
    ]
  );
}

async function markCheckoutRecoveredIfMatch(pg: Client, merchantId: string, orderPayload: any): Promise<void> {
  // Shopify's order payload includes checkout_token and/or checkout_id when the order originated from a checkout
  const checkoutToken = orderPayload?.checkout_token ?? null;
  const checkoutId = orderPayload?.checkout_id ?? null;
  if (!checkoutToken && !checkoutId) return;

  const externalId = String(checkoutId ?? checkoutToken);
  const orderRes = await pg.query<{ id: string }>(
    "SELECT id FROM public.orders WHERE merchant_id = $1 AND external_id = $2",
    [merchantId, String(orderPayload.id)]
  );
  const orderId = orderRes.rows[0]?.id ?? null;

  // RETURNING ... lets us detect whether the UPDATE actually changed a row.
  // (recovered_at IS NULL filter means a re-fired webhook for an already-
  // recovered cart returns rowCount = 0 — no double cart.recovered emit.)
  const updateRes = await pg.query<{
    email: string | null;
    total_price: string | null;
    currency: string | null;
  }>(
    `
    UPDATE public.abandoned_checkouts
    SET recovered_at = NOW(), recovery_order_id = $3, shopify_order_id = $4
    WHERE merchant_id = $1 AND external_id = $2 AND recovered_at IS NULL
    RETURNING email, total_price, currency
    `,
    [merchantId, externalId, orderId, String(orderPayload.id)]
  );

  // Emit guard: only fire if we actually flipped a row from un-recovered to recovered.
  if ((updateRes.rowCount ?? 0) > 0) {
    const recovered = updateRes.rows[0];
    try {
      await emitEvent(pg, {
        merchantId,
        eventType: EVENT_TYPES.CART_RECOVERED,
        entityType: "cart",
        entityId: externalId,
        dedupeKey: `${EVENT_TYPES.CART_RECOVERED}:${externalId}`,
        payload: {
          customer_name: customerName(orderPayload.customer),
          customer_email:
            recovered.email ?? orderPayload.customer?.email ?? null,
          total: parseFloat(
            recovered.total_price ?? orderPayload.total_price ?? "0"
          ),
          currency:
            recovered.currency ?? orderPayload.currency ?? "USD",
        },
      });
    } catch {
      /* never blocks */
    }
  }
}

async function markMerchantUninstalled(pg: Client, merchantId: string): Promise<void> {
  await pg.query(
    `
    UPDATE public.merchants
    SET status = 'uninstalled', uninstalled_at = NOW(), updated_at = NOW()
    WHERE id = $1
    `,
    [merchantId]
  );
  console.log(`[webhook app/uninstalled] merchant ${merchantId} marked uninstalled`);
}
