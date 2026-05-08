/**
 * Shared types for the v1.5 anomaly seasonality stack (Phase 6).
 *
 * Lives in its own file so the cron route, detector, threshold logic, and
 * widget all import from the same source of truth.
 */

/** Metrics watched for daily anomaly detection. */
export const ANOMALY_METRICS = [
  "revenue",
  "orders_count",
  "new_customers",
  "avg_health_score",
  "repeat_rate",
  "revenue_at_risk",
] as const;

export type AnomalyMetric = (typeof ANOMALY_METRICS)[number];

/** Why was this threshold chosen for the day? Drives merchant explanation. */
export type DetectionReason = "normal" | "sale_detected" | "public_holiday";

/** Severity bucketing — how far over threshold did the metric go? */
export type DetectionSeverity = "low" | "medium" | "high";

/**
 * Threshold layering result. `null` = skip detection entirely (snoozed).
 * `value` is the σ multiplier (3.0 / 4.0 / 5.0) used for the z-score test.
 */
export type ThresholdResult =
  | { value: number; reason: DetectionReason }
  | null;

/** Sale-detector signals — each contributes 0.2 to confidence_score. */
export type SaleSignal =
  | "discount_usage_2x"
  | "aov_drop"
  | "order_volume_spike"
  | "new_customer_surge"
  | "dominant_discount_code";

export type SaleDetection = {
  signals: SaleSignal[];
  confidence: number; // 0-1, capped at 1.0
};

/** Single anomaly row produced by the detector before INSERT. */
export type DetectedAnomaly = {
  merchant_id: string;
  metric: AnomalyMetric;
  current_value: number;
  expected_value: number;
  deviation_sigma: number;
  severity: DetectionSeverity;
  description: string;
  detected_for_day_of_week: number; // 0-6, UTC
  detection_reason: DetectionReason;
  threshold_used: number;
};
