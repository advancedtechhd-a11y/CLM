/**
 * Shopify data sync — pulls customers, orders, products from a connected Shopify store
 * and upserts into our local DB tables.
 *
 * MVP version uses paginated REST. v1.5 will use Bulk Operations (GraphQL) for efficiency.
 */

import { Client } from "pg";
import { ShopifyAdminClient } from "./admin-api";
import { decryptToken } from "./oauth";

interface SyncContext {
  pg: Client;
  shopify: ShopifyAdminClient;
  merchantId: string;
}

// ============================================================
// PRODUCTS
// ============================================================
async function syncProducts(ctx: SyncContext): Promise<number> {
  let totalSynced = 0;
  let pageInfo: string | null = null;

  do {
    const path = pageInfo
      ? `/products.json?limit=250&page_info=${pageInfo}`
      : `/products.json?limit=250`;
    const resp = await ctx.shopify.get<{ products: ShopifyProduct[] }>(path);

    for (const p of resp.products) {
      await ctx.pg.query(
        `
        INSERT INTO public.products (merchant_id, external_id, title, product_type, vendor, tags, price, status, raw_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (merchant_id, external_id) DO UPDATE SET
          title = EXCLUDED.title,
          product_type = EXCLUDED.product_type,
          vendor = EXCLUDED.vendor,
          tags = EXCLUDED.tags,
          price = EXCLUDED.price,
          status = EXCLUDED.status,
          raw_data = EXCLUDED.raw_data,
          updated_at = NOW()
        `,
        [
          ctx.merchantId,
          String(p.id),
          p.title,
          p.product_type,
          p.vendor,
          p.tags ? p.tags.split(",").map((t) => t.trim()) : [],
          p.variants?.[0]?.price ?? null,
          p.status,
          p,
        ]
      );
      totalSynced++;
    }

    // For now, simple single-page sync. Pagination via cursor is a v1.5 enhancement.
    pageInfo = null;
  } while (pageInfo);

  return totalSynced;
}

// ============================================================
// CUSTOMERS
// ============================================================
async function syncCustomers(ctx: SyncContext): Promise<number> {
  let totalSynced = 0;
  let sinceId: number | null = null;
  const PAGE_SIZE = 250;

  while (true) {
    const path: string = sinceId
      ? `/customers.json?limit=${PAGE_SIZE}&since_id=${sinceId}`
      : `/customers.json?limit=${PAGE_SIZE}`;
    const resp: { customers: ShopifyCustomer[] } = await ctx.shopify.get<{ customers: ShopifyCustomer[] }>(path);
    if (resp.customers.length === 0) break;

    for (const c of resp.customers) {
      const emailHash = c.email
        ? require("node:crypto").createHash("sha256").update(c.email.toLowerCase()).digest("hex")
        : null;

      const geo = extractCustomerGeo(c);

      await ctx.pg.query(
        `
        INSERT INTO public.customers (
          merchant_id, external_id, email, email_hash, phone, first_name, last_name,
          total_spent, orders_count, first_order_at, last_order_at,
          email_marketing_consent, sms_marketing_consent,
          tags, raw_data,
          country_code, country_name, region, city,
          last_synced_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW())
        ON CONFLICT (merchant_id, external_id) DO UPDATE SET
          email = EXCLUDED.email,
          email_hash = EXCLUDED.email_hash,
          phone = EXCLUDED.phone,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          total_spent = EXCLUDED.total_spent,
          orders_count = EXCLUDED.orders_count,
          first_order_at = EXCLUDED.first_order_at,
          last_order_at = EXCLUDED.last_order_at,
          email_marketing_consent = EXCLUDED.email_marketing_consent,
          sms_marketing_consent = EXCLUDED.sms_marketing_consent,
          tags = EXCLUDED.tags,
          raw_data = EXCLUDED.raw_data,
          country_code = COALESCE(EXCLUDED.country_code, public.customers.country_code),
          country_name = COALESCE(EXCLUDED.country_name, public.customers.country_name),
          region       = COALESCE(EXCLUDED.region,       public.customers.region),
          city         = COALESCE(EXCLUDED.city,         public.customers.city),
          last_synced_at = NOW(),
          updated_at = NOW()
        `,
        [
          ctx.merchantId,
          String(c.id),
          c.email,
          emailHash,
          c.phone,
          c.first_name,
          c.last_name,
          parseFloat(c.total_spent ?? "0"),
          c.orders_count ?? 0,
          c.first_order_at ?? null,
          c.last_order_at ?? null,
          c.email_marketing_consent?.state === "subscribed",
          c.sms_marketing_consent?.state === "subscribed",
          c.tags ? c.tags.split(",").map((t: string) => t.trim()) : [],
          c,
          geo.country_code,
          geo.country_name,
          geo.region,
          geo.city,
        ]
      );
      totalSynced++;
    }

    sinceId = resp.customers[resp.customers.length - 1].id;
    if (resp.customers.length < PAGE_SIZE) break;
  }

  return totalSynced;
}

// ============================================================
// ORDERS
// ============================================================
async function syncOrders(ctx: SyncContext): Promise<{ orders: number; lineItems: number }> {
  let totalOrders = 0;
  let totalLineItems = 0;
  let sinceId: number | null = null;
  const PAGE_SIZE = 250;

  while (true) {
    const path: string = sinceId
      ? `/orders.json?limit=${PAGE_SIZE}&status=any&since_id=${sinceId}`
      : `/orders.json?limit=${PAGE_SIZE}&status=any`;
    const resp: { orders: ShopifyOrder[] } = await ctx.shopify.get<{ orders: ShopifyOrder[] }>(path);
    if (resp.orders.length === 0) break;

    for (const o of resp.orders) {
      // Look up our customer record by external Shopify customer ID
      let customerUuid: string | null = null;
      if (o.customer?.id) {
        const lookup = await ctx.pg.query(
          "SELECT id FROM public.customers WHERE merchant_id = $1 AND external_id = $2 LIMIT 1",
          [ctx.merchantId, String(o.customer.id)]
        );
        customerUuid = lookup.rows[0]?.id ?? null;
      }

      // Detect BNPL provider from gateway / payment_gateway_names
      const bnplProvider = detectBnplProvider(o);

      const orderRes = await ctx.pg.query(
        `
        INSERT INTO public.orders (
          merchant_id, customer_id, external_id, order_number,
          order_total, subtotal, discount_total, tax_total, shipping_total, refund_total,
          currency, financial_status, fulfillment_status,
          payment_method, bnpl_provider,
          ordered_at, cancelled_at, raw_data, synced_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
        ON CONFLICT (merchant_id, external_id) DO UPDATE SET
          order_total = EXCLUDED.order_total,
          subtotal = EXCLUDED.subtotal,
          discount_total = EXCLUDED.discount_total,
          tax_total = EXCLUDED.tax_total,
          shipping_total = EXCLUDED.shipping_total,
          refund_total = EXCLUDED.refund_total,
          financial_status = EXCLUDED.financial_status,
          fulfillment_status = EXCLUDED.fulfillment_status,
          cancelled_at = EXCLUDED.cancelled_at,
          raw_data = EXCLUDED.raw_data,
          synced_at = NOW()
        RETURNING id
        `,
        [
          ctx.merchantId,
          customerUuid,
          String(o.id),
          o.order_number ? String(o.order_number) : o.name,
          parseFloat(o.total_price ?? "0"),
          parseFloat(o.subtotal_price ?? "0"),
          parseFloat(o.total_discounts ?? "0"),
          parseFloat(o.total_tax ?? "0"),
          parseFloat(o.total_shipping_price_set?.shop_money?.amount ?? "0"),
          0, // refund_total — would need separate /refunds query
          o.currency,
          o.financial_status,
          o.fulfillment_status,
          o.gateway,
          bnplProvider,
          o.processed_at ?? o.created_at,
          o.cancelled_at,
          o,
        ]
      );

      const orderUuid = orderRes.rows[0].id;
      totalOrders++;

      // Sync line items
      for (const li of o.line_items ?? []) {
        await ctx.pg.query(
          `
          INSERT INTO public.order_line_items (
            merchant_id, order_id, external_product_id, external_variant_id,
            product_title, variant_title, sku, quantity, price, total_discount
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `,
          [
            ctx.merchantId,
            orderUuid,
            li.product_id ? String(li.product_id) : null,
            li.variant_id ? String(li.variant_id) : null,
            li.title,
            li.variant_title,
            li.sku,
            li.quantity,
            parseFloat(li.price ?? "0"),
            parseFloat(li.total_discount ?? "0"),
          ]
        );
        totalLineItems++;
      }
    }

    sinceId = resp.orders[resp.orders.length - 1].id;
    if (resp.orders.length < PAGE_SIZE) break;
  }

  return { orders: totalOrders, lineItems: totalLineItems };
}

function detectBnplProvider(order: ShopifyOrder): string | null {
  const gateways = (order.payment_gateway_names ?? []).map((g) => g.toLowerCase());
  for (const g of gateways) {
    if (g.includes("klarna")) return "klarna";
    if (g.includes("affirm")) return "affirm";
    if (g.includes("afterpay")) return "afterpay";
    if (g.includes("tabby")) return "tabby";
    if (g.includes("tamara")) return "tamara";
    if (g.includes("sezzle")) return "sezzle";
  }
  return null;
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================
export async function syncMerchantData(merchantId: string, pg: Client): Promise<{
  products: number;
  customers: number;
  orders: number;
  lineItems: number;
  durationMs: number;
}> {
  const start = Date.now();

  // Load merchant
  const { rows } = await pg.query(
    "SELECT shop_domain, access_token_encrypted FROM public.merchants WHERE id = $1",
    [merchantId]
  );
  if (rows.length === 0) throw new Error(`Merchant ${merchantId} not found`);

  const shopify = new ShopifyAdminClient({
    shop: rows[0].shop_domain,
    accessToken: decryptToken(rows[0].access_token_encrypted),
  });

  const ctx: SyncContext = { pg, shopify, merchantId };

  console.log("📦 Syncing products...");
  const products = await syncProducts(ctx);
  console.log(`   ${products} products synced`);

  console.log("👥 Syncing customers...");
  const customers = await syncCustomers(ctx);
  console.log(`   ${customers} customers synced`);

  console.log("🛒 Syncing orders + line items...");
  const orderResult = await syncOrders(ctx);
  console.log(`   ${orderResult.orders} orders synced (${orderResult.lineItems} line items)`);

  // Mark sync complete on merchant
  await pg.query(
    `UPDATE public.merchants
     SET initial_sync_completed_at = COALESCE(initial_sync_completed_at, NOW()),
         last_sync_at = NOW()
     WHERE id = $1`,
    [merchantId]
  );

  return {
    products,
    customers,
    orders: orderResult.orders,
    lineItems: orderResult.lineItems,
    durationMs: Date.now() - start,
  };
}

// ============================================================
// Type definitions
// ============================================================
interface ShopifyProduct {
  id: number;
  title: string;
  product_type: string;
  vendor: string;
  tags: string;
  status: string;
  variants: Array<{ price: string }>;
}

interface ShopifyAddress {
  country_code?: string | null;
  country?: string | null; // full country name (Shopify field)
  province?: string | null;
  city?: string | null;
}

interface ShopifyCustomer {
  id: number;
  email: string | null;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  total_spent: string;
  orders_count: number;
  first_order_at: string | null;
  last_order_at: string | null;
  email_marketing_consent: { state: string } | null;
  sms_marketing_consent: { state: string } | null;
  tags: string;
  default_address?: ShopifyAddress | null;
  addresses?: ShopifyAddress[];
}

/**
 * Extract country_code / country_name / region / city from a Shopify
 * customer payload, preferring default_address and falling back to the
 * first entry of addresses[].
 */
export function extractCustomerGeo(c: {
  default_address?: ShopifyAddress | null;
  addresses?: ShopifyAddress[];
}) {
  const addr = c.default_address ?? c.addresses?.[0] ?? null;
  return {
    country_code: addr?.country_code ?? null,
    country_name: addr?.country ?? null,
    region: addr?.province ?? null,
    city: addr?.city ?? null,
  };
}

interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number | null;
  total_price: string;
  subtotal_price: string;
  total_discounts: string;
  total_tax: string;
  total_shipping_price_set?: { shop_money?: { amount: string } };
  currency: string;
  financial_status: string;
  fulfillment_status: string | null;
  gateway: string;
  payment_gateway_names: string[];
  processed_at: string | null;
  created_at: string;
  cancelled_at: string | null;
  customer: { id: number } | null;
  line_items: Array<{
    product_id: number | null;
    variant_id: number | null;
    title: string;
    variant_title: string | null;
    sku: string | null;
    quantity: number;
    price: string;
    total_discount: string;
  }>;
}
