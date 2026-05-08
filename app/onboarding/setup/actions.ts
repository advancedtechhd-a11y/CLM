"use server";

import { Client } from "pg";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { syncMerchantData } from "@/lib/shopify/sync";
import { runRulesEngine } from "@/lib/rules/compute";
import { extractBrandVoice } from "@/lib/brand/extract";
import { generateStrategy } from "@/lib/strategy/orchestrator";
import {
  DEFAULT_DAYS,
  DEFAULT_DAYS_PER_CHUNK,
  DEFAULT_TOTAL_CHUNKS,
} from "@/lib/metrics/historical-backfill";
import { computeCohortMetricsForMerchant } from "@/lib/cohorts/compute";

export type SetupStepStatus = "pending" | "running" | "done" | "skipped" | "error";

export type SetupResult = {
  ok: boolean;
  steps: { name: string; status: SetupStepStatus; detail?: string; durationMs?: number }[];
  message?: string;
  merchantId?: string;
};

/**
 * Runs the entire first-time setup pipeline:
 *   1. Sync orders/customers/products from Shopify
 *   2. Compute rules-based metrics + ML scoring (CLV/NBP/churn)
 *   3. Extract brand voice from storefront
 *   4. Generate first strategy
 *
 * Each step that fails is logged but doesn't block the others (where possible).
 */
export async function runFirstTimeSetup(): Promise<SetupResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, steps: [], message: "Not signed in" };

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, shop_domain")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("installed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!merchant) return { ok: false, steps: [], message: "No active merchant" };

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const steps: SetupResult["steps"] = [];

  try {
    // 1. Sync ─────────────────────────────────────
    let t = Date.now();
    try {
      await syncMerchantData(merchant.id, pg);
      steps.push({ name: "Sync customers + orders from Shopify", status: "done", durationMs: Date.now() - t });
    } catch (e) {
      steps.push({
        name: "Sync customers + orders from Shopify",
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // 2. Rules + ML ───────────────────────────────
    t = Date.now();
    try {
      const r = await runRulesEngine(pg, merchant.id);
      steps.push({
        name: "Score customers (rules + ML)",
        status: "done",
        detail: `${r.customerResult.customersComputed} customers scored`,
        durationMs: Date.now() - t,
      });
    } catch (e) {
      steps.push({
        name: "Score customers (rules + ML)",
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // 3. Brand voice ──────────────────────────────
    t = Date.now();
    try {
      const r = await extractBrandVoice(pg, merchant.id);
      steps.push({
        name: "Extract brand voice from your storefront",
        status: r.status === "ok" ? "done" : "skipped",
        detail: r.status === "no_pages"
          ? "Couldn't crawl your storefront (password-protected?)"
          : r.status === "low_confidence"
            ? `Low confidence — review and refresh later`
            : `Confidence: ${r.profile?.confidence.overall}`,
        durationMs: Date.now() - t,
      });
    } catch (e) {
      steps.push({
        name: "Extract brand voice from your storefront",
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // 4. Strategy ─────────────────────────────────
    t = Date.now();
    try {
      const r = await generateStrategy(pg, merchant.id);
      steps.push({
        name: "Generate your first strategy",
        status: "done",
        detail: `${r.programs_generated} programs · est $${r.total_estimated_impact.toFixed(0)} impact`,
        durationMs: Date.now() - t,
      });
    } catch (e) {
      steps.push({
        name: "Generate your first strategy",
        status: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // 4b. Cohort metrics — silent. Cheap (~1-3s) and the CohortHealth widget
    // wants something to render on day 1. If it fails, the nightly cron at
    // 2am UTC will pick it up — we don't surface as a visible step because
    // a red ✗ on a recoverable failure would worry the merchant for nothing.
    try {
      const r = await computeCohortMetricsForMerchant(pg, merchant.id);
      console.log(
        `[setup] cohort metrics: ${r.cohorts_written} cohorts written for ${merchant.id}`
      );
    } catch (e) {
      console.error(
        "[setup] cohort metrics failed (non-fatal — nightly cron will retry):",
        e instanceof Error ? e.message : e
      );
    }

  } finally {
    await pg.end();
  }

  revalidatePath("/dashboard");
  revalidatePath("/onboarding/setup");

  const hasErrors = steps.some((s) => s.status === "error");
  return {
    ok: !hasErrors,
    steps,
    message: hasErrors ? "Some steps failed — see details below" : "Setup complete!",
    merchantId: merchant.id,
  };
}

/**
 * Kick off the chunked historical health backfill (v1.5 Phase 3.5+).
 *
 * Called from SetupRunner AFTER runFirstTimeSetup succeeds. Fires chunk 0
 * to /api/internal/backfill-health-history fire-and-forget — that endpoint
 * processes one chunk (10 days), then chains to chunk 1, and so on. Each
 * chunk has its own ≤ 5-min Vercel function budget, so 100K+ customer
 * merchants never hit a single-invocation timeout.
 *
 * Idempotent — guards on `health_backfill_status` so a re-fire while the
 * job is already running is a fast no-op.
 */
export async function kickOffHealthBackfill(): Promise<{
  ok: boolean;
  message?: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Not signed in" };

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, health_backfill_status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("installed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!merchant) return { ok: false, message: "No active merchant" };
  if (merchant.health_backfill_status === "complete") {
    return { ok: true, message: "Already complete" };
  }
  if (merchant.health_backfill_status === "in_progress") {
    return { ok: true, message: "Already running" };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return { ok: false, message: "CRON_SECRET not configured" };
  }

  // Resolve the absolute base URL — needed because fetch() in Node requires
  // an absolute origin. Prefer the explicit env var, fall back to the
  // request's own host header (works in dev + Vercel previews).
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (() => {
      const h = headers();
      const host = h.get("x-forwarded-host") ?? h.get("host");
      const proto = h.get("x-forwarded-proto") ?? "https";
      return host ? `${proto}://${host}` : "http://localhost:3000";
    })();

  // Fire chunk 0. We don't await the response — the chained chunks run
  // independently. See the backfill route for chunk-chaining behavior.
  void fetch(`${baseUrl}/api/internal/backfill-health-history`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      merchant_id: merchant.id,
      chunk: 0,
      total_chunks: DEFAULT_TOTAL_CHUNKS,
      days_per_chunk: DEFAULT_DAYS_PER_CHUNK,
      total_days: DEFAULT_DAYS,
    }),
  }).catch((err) => {
    console.error("[kickOffHealthBackfill] chunk 0 fire-and-forget failed:", err);
  });

  return { ok: true };
}
