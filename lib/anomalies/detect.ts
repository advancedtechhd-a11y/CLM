/**
 * Lightweight anomaly detector.
 *
 * Phase 5 MVP: rule-based detection (no time-series modeling). Compares the latest
 * customer_health_history snapshot against the previous one and flags significant deltas.
 * The LLM (Prompt 5) generates hypotheses for any flagged anomaly.
 *
 * Future (Phase 6+): seasonal-aware detection (STL decomposition), per-segment baselines.
 */

import type { Client } from "pg";
import { llmText } from "../llm/client";
import { ANOMALY_SYSTEM, buildAnomalyUserPrompt, type AnomalyContext } from "../llm/prompts/anomaly";

export type DetectedAnomaly = {
  type: AnomalyContext["anomaly_type"];
  severity: "low" | "medium" | "high" | "critical";
  magnitude: number;
  detail: Record<string, unknown>;
};

const THRESHOLDS = {
  health_drop_pct: 10, // avg health score dropped by ≥10 pts
  churn_spike_pct: 20, // avg churn probability rose by ≥20 percentage pts
  rar_growth_pct: 25, // revenue at risk grew by ≥25%
};

export async function detectAndExplainAnomalies(pg: Client, merchantId: string) {
  const detected = await detectAnomalies(pg, merchantId);

  if (detected.length === 0) {
    return { detected: 0, explained: 0, anomalies: [] };
  }

  console.log(`🚨 Detected ${detected.length} anomaly(s) — generating LLM explanations...`);

  // Persist + explain
  const explained = [] as { id: string; type: string; explanation: string; cost_usd: number }[];
  for (const a of detected) {
    const insertRes = await pg.query<{ id: string }>(
      `
      INSERT INTO public.anomalies (merchant_id, anomaly_type, severity, magnitude, detail)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id
      `,
      [merchantId, a.type, a.severity, a.magnitude, JSON.stringify(a.detail)]
    );
    const anomalyId = insertRes.rows[0].id;

    const result = await llmText({
      model: "sonnet",
      systemPrompt: ANOMALY_SYSTEM,
      userPrompt: buildAnomalyUserPrompt({
        anomaly_type: a.type,
        magnitude: `${a.magnitude > 0 ? "+" : ""}${a.magnitude.toFixed(1)}${a.type === "churn_spike" ? " pp" : ""}`,
        timeframe: "since last scoring run",
        recent_data: JSON.stringify(a.detail),
      }),
      maxTokens: 600,
      temperature: 0.5,
    });

    await pg.query(
      "UPDATE public.anomalies SET llm_explanation = $1, llm_explained_at = NOW() WHERE id = $2",
      [result.data, anomalyId]
    );

    explained.push({ id: anomalyId, type: a.type, explanation: result.data, cost_usd: result.costUsd });
  }

  return { detected: detected.length, explained: explained.length, anomalies: explained };
}

async function detectAnomalies(pg: Client, merchantId: string): Promise<DetectedAnomaly[]> {
  // Compare today's snapshot with the previous distinct snapshot
  const { rows } = await pg.query<{ snapshot_date: string; avg_health: string; avg_churn: string }>(
    `
    SELECT
      computed_on::text AS snapshot_date,
      AVG(health_score)::float AS avg_health,
      AVG((SELECT churn_probability FROM public.customer_metrics cm
            WHERE cm.merchant_id = h.merchant_id AND cm.customer_id = h.customer_id))::float AS avg_churn
    FROM public.customer_health_history h
    WHERE merchant_id = $1
    GROUP BY computed_on
    ORDER BY computed_on DESC
    LIMIT 2
    `,
    [merchantId]
  );

  if (rows.length < 2) return [];

  const [today, prev] = rows;
  const anomalies: DetectedAnomaly[] = [];

  const healthDelta = parseFloat(today.avg_health) - parseFloat(prev.avg_health);
  if (healthDelta <= -THRESHOLDS.health_drop_pct) {
    anomalies.push({
      type: "health_drop",
      severity: healthDelta <= -20 ? "critical" : healthDelta <= -15 ? "high" : "medium",
      magnitude: healthDelta,
      detail: {
        avg_health_today: parseFloat(today.avg_health),
        avg_health_prev: parseFloat(prev.avg_health),
        snapshot_today: today.snapshot_date,
        snapshot_prev: prev.snapshot_date,
      },
    });
  }

  const churnDelta = (parseFloat(today.avg_churn ?? "0") - parseFloat(prev.avg_churn ?? "0")) * 100;
  if (churnDelta >= THRESHOLDS.churn_spike_pct) {
    anomalies.push({
      type: "churn_spike",
      severity: churnDelta >= 40 ? "critical" : churnDelta >= 30 ? "high" : "medium",
      magnitude: churnDelta,
      detail: {
        avg_churn_today_pct: parseFloat(today.avg_churn ?? "0") * 100,
        avg_churn_prev_pct: parseFloat(prev.avg_churn ?? "0") * 100,
        snapshot_today: today.snapshot_date,
        snapshot_prev: prev.snapshot_date,
      },
    });
  }

  return anomalies;
}
