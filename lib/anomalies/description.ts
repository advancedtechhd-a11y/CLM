/**
 * Per-metric anomaly description generation (v1.5 Phase 6).
 *
 * The merchant-facing string IS the entire UX. Vague or templated text
 * destroys the value of the anomaly system, so each metric gets its own
 * phrasing function with:
 *   - the metric in plain English (not "avg_health_score")
 *   - directional phrase ("down" / "up")
 *   - both numbers (current + baseline)
 *   - a magnitude (% delta or absolute pp delta as appropriate)
 *
 * NOT used:
 *   ❌ "Anomaly detected for revenue"
 *   ❌ "Metric outside normal range"
 *
 * USED:
 *   ✅ "Revenue down 22% — $1,840 yesterday vs $2,360 trailing Tuesday avg"
 *   ✅ "Health score dropped 18 points vs 8-week Tuesday baseline (72 vs 90)"
 */

import type { AnomalyMetric } from "./types";
import { formatCurrency, formatNumber } from "../utils";

const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
] as const;

/**
 * Build a human-readable description of the anomaly. Uses the day-of-week
 * phrasing where it adds context ("trailing Tuesday avg") since the
 * detector uses day-of-week-matched baselines.
 */
export function describeAnomaly(args: {
  metric: AnomalyMetric;
  currentValue: number;
  expectedValue: number;
  dayOfWeek: number; // 0-6
  currency?: string; // for revenue / aov phrasing
}): string {
  const dayName = DAY_NAMES[args.dayOfWeek] ?? "same-day";
  const direction = args.currentValue < args.expectedValue ? "down" : "up";
  const currency = args.currency ?? "USD";

  switch (args.metric) {
    case "revenue":
      return formatRevenue(args.currentValue, args.expectedValue, dayName, direction, currency);
    case "orders_count":
      return formatOrdersCount(args.currentValue, args.expectedValue, dayName, direction);
    case "new_customers":
      return formatNewCustomers(args.currentValue, args.expectedValue, dayName, direction);
    case "avg_health_score":
      return formatHealthScore(args.currentValue, args.expectedValue, dayName, direction);
    case "repeat_rate":
      return formatRepeatRate(args.currentValue, args.expectedValue, dayName, direction);
    case "revenue_at_risk":
      return formatRevenueAtRisk(args.currentValue, args.expectedValue, dayName, direction, currency);
    default:
      return `${args.metric}: ${args.currentValue} vs ${args.expectedValue}`;
  }
}

// ============================================================
// Per-metric phrasing
// ============================================================

function formatRevenue(
  current: number,
  expected: number,
  dayName: string,
  direction: "up" | "down",
  currency: string
): string {
  const pct = pctDelta(current, expected);
  return `Revenue ${direction} ${pct}% — ${formatCurrency(current, currency)} yesterday vs ${formatCurrency(expected, currency)} trailing ${dayName} avg`;
}

function formatOrdersCount(
  current: number,
  expected: number,
  dayName: string,
  direction: "up" | "down"
): string {
  const pct = pctDelta(current, expected);
  return `Order volume ${direction} ${pct}% (${formatNumber(Math.round(current))} yesterday vs ${formatNumber(Math.round(expected))} ${dayName} avg)`;
}

function formatNewCustomers(
  current: number,
  expected: number,
  dayName: string,
  direction: "up" | "down"
): string {
  const pct = pctDelta(current, expected);
  return `New customer signups ${direction} ${pct}% (${formatNumber(Math.round(current))} yesterday vs ${formatNumber(Math.round(expected))} ${dayName} avg)`;
}

function formatHealthScore(
  current: number,
  expected: number,
  dayName: string,
  direction: "up" | "down"
): string {
  const pointDelta = Math.abs(Math.round(current - expected));
  const verb = direction === "down" ? "dropped" : "rose";
  return `Health score ${verb} ${pointDelta} point${pointDelta === 1 ? "" : "s"} vs 8-week ${dayName} baseline (${Math.round(current)} vs ${Math.round(expected)})`;
}

function formatRepeatRate(
  current: number,
  expected: number,
  dayName: string,
  direction: "up" | "down"
): string {
  // repeat_rate is stored as a 0-1 fraction; show as percentage points
  const ppDelta = Math.abs((current - expected) * 100);
  const verb = direction === "down" ? "fell" : "rose";
  return `Repeat purchase rate ${verb} ${ppDelta.toFixed(1)}pp (${(current * 100).toFixed(0)}% vs ${(expected * 100).toFixed(0)}% ${dayName} avg)`;
}

function formatRevenueAtRisk(
  current: number,
  expected: number,
  dayName: string,
  direction: "up" | "down",
  currency: string
): string {
  const pct = pctDelta(current, expected);
  // Revenue-at-risk going UP is bad → phrase with "grew" not "rose"
  const verb = direction === "up" ? "grew" : "shrank";
  return `Revenue-at-risk ${verb} ${pct}% — ${formatCurrency(current, currency)} vs ${formatCurrency(expected, currency)} trailing ${dayName} avg`;
}

// ============================================================
// Severity bucketing — how far over the threshold did it go?
// ============================================================

/**
 * Bucket the anomaly severity by how much the σ exceeds the threshold.
 * For a 3σ threshold: 3-3.5σ = low, 3.5-4σ = medium, >4σ = high.
 */
export function severityFromSigma(
  sigma: number,
  threshold: number
): "low" | "medium" | "high" {
  const overshoot = sigma - threshold;
  if (overshoot > 1.0) return "high";
  if (overshoot > 0.5) return "medium";
  return "low";
}

// ============================================================
// Internal
// ============================================================

function pctDelta(current: number, expected: number): number {
  if (expected === 0) return 0;
  return Math.abs(Math.round(((current - expected) / expected) * 100));
}
