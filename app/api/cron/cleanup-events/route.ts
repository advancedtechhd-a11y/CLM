/**
 * Daily cron — cleanup-events (v1.5)
 *
 * Schedule: 3am UTC daily — see vercel.json
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Despite the name, this cron now cleans up ALL retention-bounded tables:
 *
 *   1. public.events — 90 days (powers Recent Activity widget; older not
 *      needed since the widget only shows last 20 entries)
 *   2. public.cron_runs status='complete' — 90 days (run history, audit only)
 *   3. public.cron_runs status='failed' — 180 days (longer for forensics)
 *   4. public.cron_runs status='in_progress' — NEVER (stuck — leave for
 *      detect-stuck-cron-runs to recover or for manual diagnosis)
 *
 * Returns counts per category for observability — daily zero-deletion in
 * any category may indicate that table stopped accumulating rows
 * (cron stopped firing, events stopped emitting, etc.).
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";

export const maxDuration = 60;

const EVENTS_RETENTION_DAYS = 90;
const CRON_RUNS_COMPLETE_RETENTION_DAYS = 90;
const CRON_RUNS_FAILED_RETENTION_DAYS = 180;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const startedAt = Date.now();

  try {
    const eventsRes = await pg.query(
      `DELETE FROM public.events
       WHERE created_at < NOW() - INTERVAL '${EVENTS_RETENTION_DAYS} days'`
    );
    const eventsDeleted = eventsRes.rowCount ?? 0;

    const completeRunsRes = await pg.query(
      `DELETE FROM public.cron_runs
       WHERE status = 'complete'
         AND created_at < NOW() - INTERVAL '${CRON_RUNS_COMPLETE_RETENTION_DAYS} days'`
    );
    const completeRunsDeleted = completeRunsRes.rowCount ?? 0;

    const failedRunsRes = await pg.query(
      `DELETE FROM public.cron_runs
       WHERE status = 'failed'
         AND created_at < NOW() - INTERVAL '${CRON_RUNS_FAILED_RETENTION_DAYS} days'`
    );
    const failedRunsDeleted = failedRunsRes.rowCount ?? 0;

    console.log(
      `[cleanup-events] deleted events=${eventsDeleted} ` +
        `cron_runs(complete)=${completeRunsDeleted} ` +
        `cron_runs(failed)=${failedRunsDeleted}`
    );

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      events_deleted: eventsDeleted,
      cron_runs_complete_deleted: completeRunsDeleted,
      cron_runs_failed_deleted: failedRunsDeleted,
      retention_days: {
        events: EVENTS_RETENTION_DAYS,
        cron_runs_complete: CRON_RUNS_COMPLETE_RETENTION_DAYS,
        cron_runs_failed: CRON_RUNS_FAILED_RETENTION_DAYS,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cleanup-events] failed: ${msg}`);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500 }
    );
  } finally {
    await pg.end();
  }
}
