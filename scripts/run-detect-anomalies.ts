/**
 * Manually run the v1.5 seasonality-aware anomaly detector for one merchant.
 *
 * Bypasses the cron's anomaly_detection_enabled filter — this is the
 * recommended way to test detection on a merchant before flipping the flag
 * to TRUE.
 *
 * Usage:
 *   npx tsx scripts/run-detect-anomalies.ts <shop_domain>
 *   npx tsx scripts/run-detect-anomalies.ts <shop_domain> --date=2026-05-07
 */

import { Client } from "pg";
import { config } from "dotenv";
import { detectAnomaliesForMerchant } from "../lib/anomalies/seasonality-detector";
import { yesterday } from "../lib/dates";

config({ path: ".env.local" });

async function main() {
  const shopArg = process.argv[2];
  if (!shopArg || shopArg.startsWith("--")) {
    console.error("Usage: npx tsx scripts/run-detect-anomalies.ts <shop_domain> [--date=YYYY-MM-DD]");
    process.exit(1);
  }

  const dateFlag = process.argv.find((a) => a.startsWith("--date="));
  const date = dateFlag
    ? new Date(dateFlag.split("=")[1] + "T00:00:00Z")
    : yesterday();

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const { rows } = await pg.query<{ id: string; anomaly_detection_enabled: boolean }>(
      "SELECT id, anomaly_detection_enabled FROM public.merchants WHERE shop_domain = $1",
      [shopArg]
    );
    if (rows.length === 0) {
      console.error(`No merchant found for ${shopArg}`);
      process.exit(1);
    }
    const merchantId = rows[0].id;

    console.log(`🔍 Running seasonality detector for ${shopArg}`);
    console.log(`   merchant_id:                  ${merchantId}`);
    console.log(`   anomaly_detection_enabled:    ${rows[0].anomaly_detection_enabled}`);
    console.log(`   detect for date:              ${date.toISOString().slice(0, 10)}\n`);

    const result = await detectAnomaliesForMerchant(pg, merchantId, date);

    console.log(`✅ Detection finished — reason: ${result.reason}`);
    console.log(`   anomalies detected:  ${result.detected}`);

    if (result.detected > 0) {
      const { rows: anomalyRows } = await pg.query<{
        metric: string;
        description: string;
        deviation_sigma: string;
        detection_reason: string;
      }>(
        `SELECT metric, description, deviation_sigma, detection_reason
         FROM public.anomalies
         WHERE merchant_id = $1 AND detected_at::date = $2::date
           AND metric IS NOT NULL
         ORDER BY deviation_sigma DESC`,
        [merchantId, date.toISOString().slice(0, 10)]
      );
      console.log(`\nDetected anomalies:`);
      for (const a of anomalyRows) {
        console.log(`  · [${a.metric}] (${Number(a.deviation_sigma).toFixed(1)}σ, reason=${a.detection_reason})`);
        console.log(`    "${a.description}"`);
      }
    }
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
