/**
 * Manually run the daily-metrics computation for one merchant
 * (or backfill the last N days).
 *
 * Usage:
 *   npx tsx scripts/run-compute-daily-metrics.ts <shop_domain>                # yesterday
 *   npx tsx scripts/run-compute-daily-metrics.ts <shop_domain> --date=2026-05-07
 *   npx tsx scripts/run-compute-daily-metrics.ts <shop_domain> --backfill=90  # last 90 days
 */

import { Client } from "pg";
import { config } from "dotenv";
import { computeDailyMetrics, backfillDailyMetrics } from "../lib/metrics/backfill";
import { yesterday } from "../lib/dates";

config({ path: ".env.local" });

async function main() {
  const shopArg = process.argv[2];
  if (!shopArg || shopArg.startsWith("--")) {
    console.error("Usage: npx tsx scripts/run-compute-daily-metrics.ts <shop_domain> [--date=YYYY-MM-DD] [--backfill=N]");
    process.exit(1);
  }

  const dateFlag = process.argv.find((a) => a.startsWith("--date="));
  const backfillFlag = process.argv.find((a) => a.startsWith("--backfill="));

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

    if (backfillFlag) {
      const days = parseInt(backfillFlag.split("=")[1], 10);
      if (!Number.isFinite(days) || days < 1) {
        console.error("Invalid --backfill=N");
        process.exit(1);
      }
      console.log(`📅 Backfilling last ${days} days for ${shopArg}\n`);
      const result = await backfillDailyMetrics(pg, merchantId, days);
      console.log(`✅ ${result.days_processed} days processed`);
    } else {
      const date = dateFlag
        ? new Date(dateFlag.split("=")[1] + "T00:00:00Z")
        : yesterday();
      console.log(`🧮 Computing daily metrics for ${shopArg} on ${date.toISOString().slice(0, 10)}\n`);
      const row = await computeDailyMetrics(pg, merchantId, date);
      console.log(`✅ Done — avg health: ${row.avg_health_score ?? "—"} · revenue: $${row.revenue} · orders: ${row.orders_count}`);
    }
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
