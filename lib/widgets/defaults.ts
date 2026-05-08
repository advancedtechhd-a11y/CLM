import type { WidgetLayout } from "./types";

/**
 * Default layout for new merchants. Schema v2 — explicit w/h per widget.
 * Y coordinates are sequenced so the grid renders sensibly even before
 * react-grid-layout's vertical compactor runs.
 */
export const DEFAULT_LAYOUT: WidgetLayout[] = [
  // Top row: 4 KPI cards (3w each = 12 total)
  { id: "k1", type: "kpi_revenue_at_risk", x: 0, y: 0, w: 3, h: 3 },
  { id: "k2", type: "kpi_total_revenue", x: 3, y: 0, w: 3, h: 3 },
  { id: "k3", type: "kpi_predicted_clv", x: 6, y: 0, w: 3, h: 3 },
  { id: "k4", type: "kpi_repeat_rate", x: 9, y: 0, w: 3, h: 3 },

  // Priority bar — full width, taller for content (h:3)
  { id: "pri", type: "priority_bar", x: 0, y: 3, w: 12, h: 3 },

  // Trend chart — full width
  { id: "trend", type: "trend_chart", x: 0, y: 6, w: 12, h: 4 },

  // DNA + Why split (7 + 5 = 12)
  { id: "dna", type: "dna_featured", x: 0, y: 10, w: 7, h: 5 },
  { id: "why", type: "why_reasoning", x: 7, y: 10, w: 5, h: 5 },

  // At-risk table — full width
  { id: "risk", type: "at_risk_table", x: 0, y: 15, w: 12, h: 4 },

  // Distribution row — lifecycle has 7 stages (needs h:5 to fit); donut needs h:4
  { id: "lifecycle", type: "lifecycle_distribution", x: 0, y: 19, w: 6, h: 5 },
  { id: "tier", type: "value_tier_donut", x: 6, y: 19, w: 6, h: 4 },
];
