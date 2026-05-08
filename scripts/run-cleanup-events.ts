/**
 * Manually run the events cleanup (v1.5 Phase 5).
 *
 * Useful for testing the retention boundary or running a one-off cleanup
 * outside the daily 3am UTC schedule.
 *
 * Usage:
 *   npx tsx scripts/run-cleanup-events.ts            # delete >90 days
 *   npx tsx scripts/run-cleanup-events.ts --days=30  # delete >30 days
 *   npx tsx scripts/run-cleanup-events.ts --dry-run  # count only, no delete
 */

import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  const daysFlag = process.argv.find((a) => a.startsWith("--days="));
  const dryRun = process.argv.includes("--dry-run");
  const days = daysFlag ? parseInt(daysFlag.split("=")[1], 10) : 90;
  if (!Number.isFinite(days) || days < 1 || days > 3650) {
    console.error("--days must be 1-3650");
    process.exit(1);
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    if (dryRun) {
      const { rows } = await pg.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.events WHERE created_at < NOW() - INTERVAL '${days} days'`
      );
      console.log(`[dry-run] would delete ${rows[0].count} event(s) older than ${days} days`);
    } else {
      const result = await pg.query(
        `DELETE FROM public.events WHERE created_at < NOW() - INTERVAL '${days} days'`
      );
      console.log(`✅ deleted ${result.rowCount ?? 0} event(s) older than ${days} days`);
    }
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
