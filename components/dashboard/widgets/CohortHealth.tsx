"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useWidgetData } from "@/hooks/use-widget-data";
import { fetchCohortHealth } from "@/app/actions/widget-data";
import { formatNumber } from "@/lib/utils";
import { formatMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { WidgetSkeleton, WidgetError, WidgetEmpty } from "./shared/WidgetStates";
import { useSetWidgetHeaderLink } from "../widget-subtitle-context";

/**
 * Cohort Health — last 6 cohort months × 30/60/90-day retention.
 *
 * Cells are color-coded:
 *   ≥ 60%  → success tone (green)
 *   30-60% → warning tone (amber)
 *   < 30%  → destructive tone (red)
 *   null   → "—" (cohort hasn't matured this window yet)
 *
 * Sticky footer + header link → /dashboard/customers (closest existing
 * detail surface; v1.6 candidate is a dedicated cohort drill-down).
 */
export function CohortHealth() {
  const fetcher = useCallback(() => fetchCohortHealth(), []);
  const { data, isLoading, error, refetch } = useWidgetData(fetcher);
  const setHeaderLink = useSetWidgetHeaderLink();

  useEffect(() => {
    if (!data || data.length === 0) {
      setHeaderLink(null);
      return;
    }
    setHeaderLink({
      href: "/dashboard/customers",
      label: "View customers",
    });
    return () => setHeaderLink(null);
  }, [data, setHeaderLink]);

  if (isLoading) return <WidgetSkeleton rows={6} />;
  if (error) return <WidgetError onRetry={refetch} />;
  if (!data || data.length === 0)
    return (
      <WidgetEmpty message="No cohort data yet — needs at least one full month of customer history." />
    );

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto -mx-5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-muted-foreground font-medium border-b border-border">
              <th className="text-left px-5 py-2">Cohort</th>
              <th className="text-right px-5 py-2">Size</th>
              <th className="text-right px-5 py-2">30d</th>
              <th className="text-right px-5 py-2">60d</th>
              <th className="text-right px-5 py-2">90d</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c) => (
              <tr
                key={c.cohort_month}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-5 py-2 font-medium text-foreground whitespace-nowrap">
                  {formatMonth(c.cohort_month)}
                </td>
                <td className="px-5 py-2 text-right tabular-nums text-muted-foreground">
                  {formatNumber(c.cohort_size)}
                </td>
                <RetentionCell pct={c.retention_30d_pct} />
                <RetentionCell pct={c.retention_60d_pct} />
                <RetentionCell pct={c.retention_90d_pct} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex-shrink-0 pt-2 mt-2 border-t border-border">
        <Link
          href="/dashboard/customers"
          className="text-xs text-primary font-medium hover:underline inline-flex items-center gap-1"
        >
          View customers
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function RetentionCell({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <td className="px-5 py-2 text-right tabular-nums text-muted-foreground/50">
        —
      </td>
    );
  }
  // Color coding tiered to typical Shopify benchmarks:
  //   ≥ 60% strong  · 30-60% middling · < 30% weak
  const tone =
    pct >= 60
      ? "text-success"
      : pct >= 30
        ? "text-warning"
        : "text-destructive";
  return (
    <td className={cn("px-5 py-2 text-right tabular-nums font-medium", tone)}>
      {pct.toFixed(0)}%
    </td>
  );
}
