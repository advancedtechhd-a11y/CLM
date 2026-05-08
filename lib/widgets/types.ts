/**
 * Widget dashboard type definitions.
 *
 * Schema v2 (drag-resize) — widgets store explicit `w` and `h` in grid units.
 * Constraints (minW/maxW/minH/maxH) live in WIDGET_CONFIGS so users can
 * drag-resize freely but stay within reasonable bounds.
 *
 * The legacy `size` field is kept as optional for backward-compatible loading
 * — `loadLayout` migrates it to w/h on first read.
 */

import type { LucideIcon } from "lucide-react";

export type WidgetType =
  | "kpi_revenue_at_risk"
  | "kpi_total_revenue"
  | "kpi_predicted_clv"
  | "kpi_repeat_rate"
  | "priority_bar"
  | "trend_chart"
  | "dna_featured"
  | "why_reasoning"
  | "at_risk_table"
  | "lifecycle_distribution"
  | "value_tier_donut"
  | "geographic_spread"
  | "health_score_trend"
  | "cohort_health"
  | "recent_activity"
  | "anomalies_panel";

/** Legacy v1 size keys — present in old saved layouts only. */
export type SizeTier = "small" | "medium" | "large";

export type WidgetCategory = "kpis" | "customers" | "analytics";

export type IconColor =
  | "green"
  | "blue"
  | "purple"
  | "amber"
  | "red"
  | "pink"
  | "coral";

export type WidgetLayout = {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Legacy field present in v1 saved layouts. Migrated to w/h on load. */
  size?: SizeTier;
  config?: Record<string, any>;
};

export type WidgetConfig = {
  title: string;
  description: string;
  category: WidgetCategory;
  icon: LucideIcon;
  iconColor: IconColor;
  defaultW: number;
  defaultH: number;
  minW: number;
  maxW: number;
  minH: number;
  maxH: number;
  allowMultiple: boolean;
};
