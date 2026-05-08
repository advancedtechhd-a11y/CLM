/**
 * Manually re-fire a chunk of a stuck/failed chunked cron run.
 *
 * Use when:
 *   * detect-stuck-cron-runs has hit its 3-attempt cap and marked a run failed
 *   * You want to test a specific cron's chunk handling locally
 *   * Forcing a one-off recovery without waiting for the daily 7am UTC cron
 *
 * Reads the cron_runs row, computes next chunk position from chunks_completed,
 * fires the cron's GET endpoint with run_id+offset (or just run_id for the
 * email cron's claim-based pagination).
 *
 * Usage:
 *   npx tsx scripts/run-cron-chunk.ts --run-id=<uuid>
 *   npx tsx scripts/run-cron-chunk.ts --run-id=<uuid> --from-chunk=4
 *
 *   --from-chunk=N forces a specific chunk number (rare — use only when
 *   you know chunks_completed in the DB is wrong, e.g. after manual SQL
 *   cleanup).
 */

import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const OFFSET_BASED_CRONS = new Set([
  "/api/cron/compute-daily-metrics",
  "/api/cron/compute-cohort-metrics",
  "/api/cron/detect-anomalies",
]);
const BATCH_SIZE = 5;

async function main() {
  const runIdFlag = process.argv.find((a) => a.startsWith("--run-id="));
  const fromChunkFlag = process.argv.find((a) => a.startsWith("--from-chunk="));

  if (!runIdFlag) {
    console.error("Usage: npx tsx scripts/run-cron-chunk.ts --run-id=<uuid> [--from-chunk=N]");
    process.exit(1);
  }
  const runId = runIdFlag.split("=")[1];
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    console.error("--run-id must be a UUID");
    process.exit(1);
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const { rows } = await pg.query<{
      cron_path: string;
      status: string;
      chunks_completed: number;
      total_merchants: number;
      recovery_attempts: number;
      error: string | null;
    }>(
      `SELECT cron_path, status, chunks_completed, total_merchants,
              recovery_attempts, error
       FROM public.cron_runs
       WHERE id = $1`,
      [runId]
    );
    if (rows.length === 0) {
      console.error(`No cron_runs row with id=${runId}`);
      process.exit(1);
    }
    const run = rows[0];

    console.log(`📋 Run state:`);
    console.log(`   cron_path:           ${run.cron_path}`);
    console.log(`   status:              ${run.status}`);
    console.log(`   chunks_completed:    ${run.chunks_completed}`);
    console.log(`   total_merchants:     ${run.total_merchants}`);
    console.log(`   recovery_attempts:   ${run.recovery_attempts}`);
    if (run.error) console.log(`   error:               ${run.error}`);
    console.log("");

    if (run.status === "complete") {
      console.log("⚠️  Run is already complete. Re-firing would no-op or duplicate work. Aborting.");
      console.log("   To force a re-run, manually reset status to 'in_progress' first.");
      return;
    }

    // If status is 'failed', resurrect it
    if (run.status === "failed") {
      console.log("🔄 Resetting status from 'failed' → 'in_progress' (recovery_attempts → 0)");
      await pg.query(
        `UPDATE public.cron_runs
         SET status = 'in_progress',
             recovery_attempts = 0,
             error = NULL,
             last_chunk_at = NOW()
         WHERE id = $1`,
        [runId]
      );
    }

    // Compute the next chunk's position
    const chunksCompleted = fromChunkFlag
      ? parseInt(fromChunkFlag.split("=")[1], 10)
      : run.chunks_completed;

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("CRON_SECRET not in .env.local");
      process.exit(1);
    }

    let url: string;
    if (OFFSET_BASED_CRONS.has(run.cron_path)) {
      const nextOffset = chunksCompleted * BATCH_SIZE;
      url = `${baseUrl}${run.cron_path}?run_id=${runId}&offset=${nextOffset}`;
      console.log(`🚀 Firing chunk at offset=${nextOffset} (${run.cron_path})`);
    } else {
      url = `${baseUrl}${run.cron_path}?run_id=${runId}`;
      console.log(`🚀 Firing claim-based chunk (${run.cron_path})`);
    }

    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await resp.json().catch(() => ({}));
    console.log(`\n← ${resp.status} ${resp.statusText}`);
    console.log(JSON.stringify(body, null, 2));

    if (!resp.ok) process.exit(1);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
