/**
 * Manually compute cohort metrics for one merchant (v1.5 Phase 4).
 *
 * Useful for:
 *   * Testing the cohort recomputation logic against real data
 *   * Existing merchants installed before Phase 4 shipped
 *   * Forcing a refresh after a schema change
 *
 * Usage:
 *   npx tsx scripts/run-compute-cohort-metrics.ts <shop_domain>
 */

import { Client } from "pg";
import { config } from "dotenv";
import { computeCohortMetricsForMerchant } from "../lib/cohorts/compute";

config({ path: ".env.local" });

async function main() {
  const shopArg = process.argv[2];
  if (!shopArg) {
    console.error("Usage: npx tsx scripts/run-compute-cohort-metrics.ts <shop_domain>");
    process.exit(1);
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const { rows } = await pg.query<{ id: string }>(
      "SELECT id FROM public.merchants WHERE shop_domain = $1",
      [shopArg]
    );
    if (rows.length === 0) {
      console.error(`No merchant found for ${shopArg}`);
      process.exit(1);
    }
    const merchantId = rows[0].id;

    console.log(`📊 Computing cohort metrics for ${shopArg} (last 12 months)\n`);

    const start = Date.now();
    const result = await computeCohortMetricsForMerchant(pg, merchantId);
    const sec = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`✅ Done in ${sec}s`);
    console.log(`   months processed:        ${result.months_processed}`);
    console.log(`   cohorts written:         ${result.cohorts_written}`);
    console.log(`   cohorts skipped (empty): ${result.cohorts_skipped_empty}`);
    console.log(
      `\nThe CohortHealth widget should now render. Refresh /dashboard/grid to verify.`
    );
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
