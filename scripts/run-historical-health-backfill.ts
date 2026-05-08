/**
 * Manually run the historical health-history backfill for one merchant.
 *
 * Useful for:
 *   * Existing merchants who installed before Phase 3.5 shipped
 *   * Resuming after a 'failed' or stuck 'in_progress' status
 *     (use --from-chunk=N to skip already-completed chunks)
 *   * Testing the reconstruction against real data
 *
 * Runs locally — no Vercel timeout, no chunk-chaining ceremony. Walks every
 * chunk back-to-back in one process.
 *
 * Usage:
 *   npx tsx scripts/run-historical-health-backfill.ts <shop_domain>
 *   npx tsx scripts/run-historical-health-backfill.ts <shop_domain> --days=30
 *   npx tsx scripts/run-historical-health-backfill.ts <shop_domain> --from-chunk=4
 */

import { Client } from "pg";
import { config } from "dotenv";
import {
  backfillCustomerHealthHistory,
  DEFAULT_DAYS,
} from "../lib/metrics/historical-backfill";

config({ path: ".env.local" });

async function main() {
  const shopArg = process.argv[2];
  if (!shopArg || shopArg.startsWith("--")) {
    console.error(
      "Usage: npx tsx scripts/run-historical-health-backfill.ts <shop_domain> [--days=N] [--from-chunk=N]"
    );
    process.exit(1);
  }

  const daysFlag = process.argv.find((a) => a.startsWith("--days="));
  const fromChunkFlag = process.argv.find((a) => a.startsWith("--from-chunk="));
  const days = daysFlag ? parseInt(daysFlag.split("=")[1], 10) : DEFAULT_DAYS;
  const fromChunk = fromChunkFlag ? parseInt(fromChunkFlag.split("=")[1], 10) : 0;
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    console.error("--days must be 1-365");
    process.exit(1);
  }
  if (!Number.isFinite(fromChunk) || fromChunk < 0) {
    console.error("--from-chunk must be a non-negative integer");
    process.exit(1);
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const { rows } = await pg.query<{
      id: string;
      health_backfill_status: string;
      health_backfill_chunks_completed: number;
      health_backfill_chunks_total: number | null;
    }>(
      `SELECT id, health_backfill_status,
              health_backfill_chunks_completed, health_backfill_chunks_total
       FROM public.merchants WHERE shop_domain = $1`,
      [shopArg]
    );
    if (rows.length === 0) {
      console.error(`No merchant found for ${shopArg}`);
      process.exit(1);
    }
    const merchantId = rows[0].id;

    console.log(`📈 Reconstructing ${days} days of customer_health_history for ${shopArg}`);
    console.log(`   merchant_id:        ${merchantId}`);
    console.log(`   current status:     ${rows[0].health_backfill_status}`);
    console.log(
      `   chunks done:        ${rows[0].health_backfill_chunks_completed} / ${rows[0].health_backfill_chunks_total ?? "?"}`
    );
    if (fromChunk > 0) {
      console.log(`   resuming from:      chunk ${fromChunk}`);
    }
    console.log("");

    const start = Date.now();
    const result = await backfillCustomerHealthHistory(
      pg,
      merchantId,
      days,
      fromChunk
    );
    const sec = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\n✅ Done in ${sec}s`);
    console.log(`   chunks processed:  ${result.chunks_processed}`);
    console.log(`   days processed:    ${result.days_processed}`);
    console.log(`   total rows added:  ${result.total_history_rows}`);
    console.log(
      `\nThe HealthScoreTrend widget should now render. Refresh /dashboard/grid to verify.`
    );
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
