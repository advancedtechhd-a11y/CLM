import type { ComponentType } from "react";
import type { WidgetType } from "@/lib/widgets/types";

import { KpiRevenueAtRisk } from "./widgets/KpiRevenueAtRisk";
import { KpiTotalRevenue } from "./widgets/KpiTotalRevenue";
import { KpiPredictedClv } from "./widgets/KpiPredictedClv";
import { KpiRepeatRate } from "./widgets/KpiRepeatRate";
import { LifecycleDistribution } from "./widgets/LifecycleDistribution";
import { ValueTierDonut } from "./widgets/ValueTierDonut";
import { TrendChart } from "./widgets/TrendChart";
import { AtRiskTable } from "./widgets/AtRiskTable";
import { DnaFeatured } from "./widgets/DnaFeatured";
import { WhyReasoning } from "./widgets/WhyReasoning";
import { PriorityBar } from "./widgets/PriorityBar";
import { GeographicSpread } from "./widgets/GeographicSpread";
import { HealthScoreTrend } from "./widgets/HealthScoreTrend";
import { CohortHealth } from "./widgets/CohortHealth";
import { RecentActivity } from "./widgets/RecentActivity";
import { AnomaliesPanel } from "./widgets/AnomaliesPanel";

export type WidgetComponentProps = {
  widgetId: string;
};

/**
 * Registry mapping each WidgetType to its rendering component.
 * 11 v1 widgets + 5 v1.5 widgets (geographic_spread Phase 2, health_score_trend Phase 3,
 * cohort_health Phase 4, recent_activity Phase 5, anomalies_panel Phase 6).
 */
export const WIDGET_COMPONENTS: Partial<
  Record<WidgetType, ComponentType<WidgetComponentProps>>
> = {
  kpi_revenue_at_risk: KpiRevenueAtRisk,
  kpi_total_revenue: KpiTotalRevenue,
  kpi_predicted_clv: KpiPredictedClv,
  kpi_repeat_rate: KpiRepeatRate,
  lifecycle_distribution: LifecycleDistribution,
  value_tier_donut: ValueTierDonut,
  trend_chart: TrendChart,
  at_risk_table: AtRiskTable,
  dna_featured: DnaFeatured,
  why_reasoning: WhyReasoning,
  priority_bar: PriorityBar,
  geographic_spread: GeographicSpread,
  health_score_trend: HealthScoreTrend,
  cohort_health: CohortHealth,
  recent_activity: RecentActivity,
  anomalies_panel: AnomaliesPanel,
};
