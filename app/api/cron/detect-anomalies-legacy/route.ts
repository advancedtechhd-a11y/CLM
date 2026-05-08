/**
 * ============================================================
 * DEPRECATED: replaced by seasonality-detector.ts in v1.5 Phase 6
 * (2026-05-08). Kept until 2026-06-08 in case of rollback need,
 * then delete this entire file + directory.
 *
 * Rollback path (if the new seasonality detector misfires badly):
 *   1. Edit vercel.json — change the cron entry's `path` from
 *      "/api/cron/detect-anomalies" to "/api/cron/detect-anomalies-legacy"
 *   2. Redeploy. Legacy detector resumes within minutes.
 *
 * After 30 days of stable seasonality detection (i.e. on or after
 * 2026-06-08), delete this file, the directory, and remove this
 * deprecation note from PROJECT-STATUS.md.
 * ============================================================
 *
 * Original v1.1 weekly anomaly cron — runs over every active merchant,
 * runs the simple delta-based detector, generates LLM explanations.
 *
 * Schedule (when active): Mondays 9 AM UTC
 * Security: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import { Client } from "pg";
import { detectAndExplainAnomalies } from "@/lib/anomalies/detect";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured on server" },
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
  const results: Array<{
    merchant_id: string;
    detected?: number;
    explained?: number;
    error?: string;
  }> = [];

  try {
    const { rows: merchants } = await pg.query<{ id: string; shop_domain: string }>(
      "SELECT id, shop_domain FROM public.merchants WHERE status = 'active'"
    );
    console.log(`[anomaly-cron LEGACY] Scanning ${merchants.length} active merchants`);

    for (const m of merchants) {
      try {
        const r = await detectAndExplainAnomalies(pg, m.id);
        results.push({ merchant_id: m.id, detected: r.detected, explained: r.explained });
        if (r.detected > 0) {
          console.log(`[anomaly-cron LEGACY] ${m.shop_domain}: ${r.detected} anomaly(s) detected`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[anomaly-cron LEGACY] Failed for ${m.shop_domain}:`, message);
        results.push({ merchant_id: m.id, error: message });
      }
    }

    return NextResponse.json({
      ok: true,
      legacy: true,
      duration_ms: Date.now() - startedAt,
      merchants_scanned: results.length,
      anomalies_detected: results.reduce((s, r) => s + (r.detected ?? 0), 0),
      results,
    });
  } finally {
    await pg.end();
  }
}
