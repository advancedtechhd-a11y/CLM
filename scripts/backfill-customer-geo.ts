/**
 * Backfill customer geo columns (v1.5 Phase 1).
 *
 * Per-merchant. For every customer where country_code IS NULL:
 *   1. First try to extract geo from their most recent order's
 *      raw_data.shipping_address (free — no API call needed).
 *   2. Fallback: fetch from Shopify Customer API, rate-limited to
 *      2 calls/sec (Shopify standard limit).
 *
 * Idempotent — safe to re-run. Skips customers we already filled.
 *
 * Usage:
 *   npx tsx scripts/backfill-customer-geo.ts <shop_domain>
 *   npx tsx scripts/backfill-customer-geo.ts <shop_domain> --dry-run
 *   npx tsx scripts/backfill-customer-geo.ts <shop_domain> --no-api
 */

import { Client } from "pg";
import { config } from "dotenv";
import { decryptToken } from "../lib/shopify/oauth";
import { ShopifyAdminClient } from "../lib/shopify/admin-api";

config({ path: ".env.local" });

const SHOPIFY_RATE_LIMIT_MS = 500; // 2 calls/sec
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type CustomerRow = {
  id: string;
  external_id: string;
  email: string | null;
};

async function main() {
  const shopArg = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  const noApi = process.argv.includes("--no-api"); // skip API fallback (free pass only)

  if (!shopArg || shopArg.startsWith("--")) {
    console.error("Usage: npx tsx scripts/backfill-customer-geo.ts <shop_domain> [--dry-run] [--no-api]");
    process.exit(1);
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const merchantRow = await pg.query<{
      id: string;
      shop_domain: string;
      access_token_encrypted: string | null;
    }>(
      "SELECT id, shop_domain, access_token_encrypted FROM public.merchants WHERE shop_domain = $1",
      [shopArg]
    );
    if (merchantRow.rows.length === 0) {
      console.error(`No merchant found with shop_domain = ${shopArg}`);
      process.exit(1);
    }
    const merchant = merchantRow.rows[0];

    const { rows: customers } = await pg.query<CustomerRow>(
      `SELECT id, external_id, email
       FROM public.customers
       WHERE merchant_id = $1 AND country_code IS NULL`,
      [merchant.id]
    );
    console.log(`${shopArg} — ${customers.length} customer(s) need geo backfill\n`);
    if (customers.length === 0) return;

    let filledFromOrders = 0;
    let filledFromApi = 0;
    let stillMissing = 0;

    const shopify =
      !noApi && merchant.access_token_encrypted
        ? new ShopifyAdminClient({
            shop: merchant.shop_domain,
            accessToken: decryptToken(merchant.access_token_encrypted),
          })
        : null;

    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];

      // ── Pass 1: free — extract from most recent order's raw_data ────
      const fromOrder = await tryExtractFromOrders(pg, merchant.id, c.id);
      if (fromOrder) {
        await applyGeo(pg, c.id, fromOrder, dryRun);
        filledFromOrders++;
        if ((i + 1) % 50 === 0) console.log(`  ... ${i + 1}/${customers.length} processed`);
        continue;
      }

      // ── Pass 2: Shopify API ─────────────────────────────────────────
      if (!shopify) {
        stillMissing++;
        continue;
      }
      try {
        const resp = await shopify.get<{ customer: any }>(
          `/customers/${c.external_id}.json`
        );
        const addr =
          resp.customer?.default_address ?? resp.customer?.addresses?.[0] ?? null;
        if (!addr?.country_code) {
          stillMissing++;
        } else {
          await applyGeo(
            pg,
            c.id,
            {
              country_code: addr.country_code,
              country_name: addr.country ?? null,
              region: addr.province ?? null,
              city: addr.city ?? null,
            },
            dryRun
          );
          filledFromApi++;
        }
        await sleep(SHOPIFY_RATE_LIMIT_MS);
      } catch (err) {
        console.warn(
          `  ⚠️  ${c.email ?? c.external_id} — Shopify API failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        stillMissing++;
      }
      if ((i + 1) % 50 === 0) console.log(`  ... ${i + 1}/${customers.length} processed`);
    }

    console.log(
      `\n${dryRun ? "[dry-run] " : ""}Done · from orders: ${filledFromOrders} · from API: ${filledFromApi} · still missing: ${stillMissing}`
    );
  } finally {
    await pg.end();
  }
}

type Geo = {
  country_code: string | null;
  country_name: string | null;
  region: string | null;
  city: string | null;
};

async function tryExtractFromOrders(
  pg: Client,
  merchantId: string,
  customerId: string
): Promise<Geo | null> {
  const { rows } = await pg.query<{ raw_data: any }>(
    `SELECT raw_data
     FROM public.orders
     WHERE merchant_id = $1 AND customer_id = $2 AND raw_data IS NOT NULL
     ORDER BY ordered_at DESC
     LIMIT 5`,
    [merchantId, customerId]
  );
  for (const r of rows) {
    const addr = r.raw_data?.shipping_address ?? r.raw_data?.billing_address ?? null;
    if (addr?.country_code) {
      return {
        country_code: addr.country_code,
        country_name: addr.country ?? null,
        region: addr.province ?? null,
        city: addr.city ?? null,
      };
    }
  }
  return null;
}

async function applyGeo(pg: Client, customerId: string, geo: Geo, dryRun: boolean) {
  if (dryRun) return;
  await pg.query(
    `UPDATE public.customers
     SET country_code = $2,
         country_name = $3,
         region       = $4,
         city         = $5,
         updated_at   = NOW()
     WHERE id = $1`,
    [customerId, geo.country_code, geo.country_name, geo.region, geo.city]
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
