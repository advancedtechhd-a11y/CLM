/**
 * Manually trigger a full sync for a merchant.
 *
 * Usage:
 *   npx tsx scripts/sync-merchant.ts <shop_domain>
 */

import { Client } from "pg";
import { config } from "dotenv";
import { syncMerchantData } from "../lib/shopify/sync";

config({ path: ".env.local" });

async function main() {
  const shopArg = process.argv[2];
  if (!shopArg) {
    console.error("Usage: npx tsx scripts/sync-merchant.ts <shop_domain>");
    process.exit(1);
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const { rows } = await pg.query(
    "SELECT id FROM public.merchants WHERE shop_domain = $1 LIMIT 1",
    [shopArg]
  );
  if (rows.length === 0) {
    console.error(`No merchant found with shop_domain = ${shopArg}`);
    await pg.end();
    process.exit(1);
  }

  const merchantId = rows[0].id;
  console.log(`🔄 Starting full sync for ${shopArg} (merchant_id=${merchantId})\n`);

  try {
    const result = await syncMerchantData(merchantId, pg);
    console.log(`\n✅ Sync complete in ${result.durationMs}ms`);
    console.log(`   Products:    ${result.products}`);
    console.log(`   Customers:   ${result.customers}`);
    console.log(`   Orders:      ${result.orders}`);
    console.log(`   Line items:  ${result.lineItems}`);
  } catch (err) {
    console.error("❌ Sync failed:", err);
    process.exit(1);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
