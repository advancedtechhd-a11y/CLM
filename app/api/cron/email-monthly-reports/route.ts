/**
 * Monthly Report Email cron (chunked + atomic-claim, v1.5).
 *
 * Schedule: 9am UTC on the 1st of each month.
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Two layers of dedupe protection (per Phase 7.5 review):
 *   1. ATOMIC SQL CLAIM — `UPDATE ... WHERE emailed_at IS NULL RETURNING`
 *      with `FOR UPDATE SKIP LOCKED` semantics, so two concurrent chunks
 *      never see the same row as un-sent. Closes the SELECT→UPDATE race.
 *   2. RESEND IDEMPOTENCY KEY — `monthly-report:${report.id}` passed via
 *      Idempotency-Key header. If we send, then have a network blip, then
 *      reset emailed_at on the apparent failure, the retry hits Resend's
 *      idempotency layer and is rejected as a duplicate. Closes the
 *      SMTP-handoff race.
 *
 * Together: a report is delivered exactly once even under network failure +
 * cron-chunk re-fire combined.
 *
 * Chunked self-firing — each chunk claims 3 reports (LLM/email work is
 * heavier than a SQL upsert, so smaller batches than the metrics crons).
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { sendEmail, isEmailConfigured } from "@/lib/email/resend";
import { buildMonthlyReportEmail } from "@/lib/email/templates/monthly-report";
import {
  startCronRun,
  recordChunkComplete,
  markCronRunComplete,
  markCronRunFailed,
} from "@/lib/cron/run-state";

export const maxDuration = 300;

const BATCH_SIZE = 3;

type ClaimedReport = {
  id: string;
  merchant_id: string;
  period_start: string;
  body_markdown: string;
  shop_domain: string;
  store_name: string | null;
  user_email: string | null;
  user_name: string | null;
};

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not set" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { ok: false, error: "RESEND_API_KEY not configured" },
      { status: 500 }
    );
  }

  const url = new URL(req.url);
  let runId = url.searchParams.get("run_id");

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const startedAt = Date.now();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";
  const results: Array<{
    report_id: string;
    sent: boolean;
    deduped?: boolean;
    error?: string;
  }> = [];

  try {
    // Bootstrap the run row on chunk 0
    if (!runId) {
      const { rows: countRows } = await pg.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c
         FROM public.merchant_reports r
         JOIN public.merchants m ON m.id = r.merchant_id
         WHERE r.report_type = 'monthly_narrative'
           AND r.emailed_at IS NULL
           AND r.period_start >= CURRENT_DATE - INTERVAL '90 days'
           AND m.status = 'active'`
      );
      const total = parseInt(countRows[0].c, 10);
      if (total === 0) {
        return NextResponse.json({
          ok: true,
          duration_ms: Date.now() - startedAt,
          run_id: null,
          reports_processed: 0,
          note: "no unsent reports",
        });
      }
      runId = await startCronRun(pg, {
        cronPath: "/api/cron/email-monthly-reports",
        totalMerchants: total,
        metadata: { unit: "reports" },
      });
    }

    // ── Atomic claim: select N unsent reports, mark emailed_at = NOW() in
    //    one statement. SKIP LOCKED ensures concurrent chunks don't fight.
    //    If sending fails, we reset emailed_at = NULL below.
    const claimRes = await pg.query<ClaimedReport>(
      `WITH to_claim AS (
         SELECT r.id
         FROM public.merchant_reports r
         JOIN public.merchants m ON m.id = r.merchant_id
         WHERE r.report_type = 'monthly_narrative'
           AND r.emailed_at IS NULL
           AND r.period_start >= CURRENT_DATE - INTERVAL '90 days'
           AND m.status = 'active'
         ORDER BY r.period_start DESC
         LIMIT $1
         FOR UPDATE OF r SKIP LOCKED
       ),
       claimed AS (
         UPDATE public.merchant_reports
         SET emailed_at = NOW()
         WHERE id IN (SELECT id FROM to_claim)
         RETURNING id, merchant_id, period_start::text, body_markdown
       )
       SELECT
         c.id, c.merchant_id, c.period_start, c.body_markdown,
         m.shop_domain, m.store_name,
         u.email AS user_email, u.full_name AS user_name
       FROM claimed c
       JOIN public.merchants m ON m.id = c.merchant_id
       LEFT JOIN public.users u ON u.id = m.user_id`,
      [BATCH_SIZE]
    );

    const claimed = claimRes.rows;
    console.log(
      `[email-cron] chunk claimed ${claimed.length} report(s) (run=${runId})`
    );

    // ── Send each claimed report. On send failure, reset emailed_at = NULL.
    //    Resend idempotencyKey ensures a partial-send retry can't double-deliver.
    for (const r of claimed) {
      if (!r.user_email) {
        // Can't send without recipient — leave emailed_at SET so we don't
        // retry; the row needs manual triage. Audit log will surface this.
        results.push({
          report_id: r.id,
          sent: false,
          error: "no recipient email on file",
        });
        continue;
      }

      const periodLabel = new Date(r.period_start).toLocaleString("en-US", {
        month: "long",
        year: "numeric",
      });
      const merchantName = r.store_name ?? r.shop_domain;
      const dashboardUrl = `${appUrl}/dashboard/reports/${r.id}`;
      const firstName = r.user_name?.split(/\s+/)[0];

      const { subject, html, text } = buildMonthlyReportEmail({
        merchant_name: merchantName,
        period_label: periodLabel,
        body_markdown: r.body_markdown,
        dashboard_url: dashboardUrl,
        recipient_first_name: firstName,
      });

      const sendResult = await sendEmail({
        to: r.user_email,
        subject,
        html,
        text,
        idempotencyKey: `monthly-report:${r.id}`,
      });

      if (sendResult.ok) {
        // Either fresh send (message_id set) or Resend deduped a duplicate
        // (sendResult.deduped === true) — both mean the recipient has it.
        await pg.query(
          `UPDATE public.merchant_reports
           SET email_recipient = $2
           WHERE id = $1`,
          [r.id, r.user_email]
        );
        results.push({
          report_id: r.id,
          sent: true,
          deduped: sendResult.deduped,
        });
      } else {
        // Send genuinely failed — reset emailed_at so the next cron run retries.
        // The idempotencyKey on the retry will dedupe at Resend if our reset
        // race with a successful prior send (the partial-send case).
        await pg.query(
          `UPDATE public.merchant_reports
           SET emailed_at = NULL
           WHERE id = $1`,
          [r.id]
        );
        results.push({
          report_id: r.id,
          sent: false,
          error: sendResult.error,
        });
      }
    }

    // ── Decide: more reports remaining? (Could be — claim returned partial)
    const isLast = claimed.length < BATCH_SIZE;
    const newChunksCompleted = (await getChunksCompleted(pg, runId)) + 1;
    await recordChunkComplete(pg, runId, newChunksCompleted);

    if (isLast) {
      await markCronRunComplete(pg, runId);
    } else {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
      void fetch(
        `${baseUrl}/api/cron/email-monthly-reports?run_id=${runId}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${cronSecret}` },
        }
      ).catch((err) => {
        console.error("[email-cron] fire-and-forget next chunk failed:", err);
      });
    }

    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      run_id: runId,
      chunk: newChunksCompleted - 1,
      reports_processed: results.length,
      sent: results.filter((r) => r.sent).length,
      deduped: results.filter((r) => r.deduped).length,
      results,
      is_last: isLast,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[email-cron] chunk failed: ${msg}`);
    if (runId) {
      try {
        await markCronRunFailed(pg, runId, msg);
      } catch {
        /* secondary failure */
      }
    }
    return NextResponse.json(
      { ok: false, run_id: runId, error: msg },
      { status: 500 }
    );
  } finally {
    await pg.end();
  }
}

async function getChunksCompleted(pg: Client, runId: string): Promise<number> {
  const { rows } = await pg.query<{ chunks_completed: number }>(
    `SELECT chunks_completed FROM public.cron_runs WHERE id = $1`,
    [runId]
  );
  return rows[0]?.chunks_completed ?? 0;
}
