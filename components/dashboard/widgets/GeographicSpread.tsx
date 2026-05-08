"use client";

import { useCallback } from "react";
import { useWidgetData } from "@/hooks/use-widget-data";
import { fetchGeographicSpread } from "@/app/actions/widget-data";
import { getFlagEmoji } from "@/lib/utils/flags";
import { formatNumber } from "@/lib/utils";
import { WidgetSkeleton, WidgetError, WidgetEmpty } from "./shared/WidgetStates";

/**
 * Geographic Spread — top countries by customer count.
 * Server returns top 10; we render top 8 (rest scroll into view if widget is tall).
 *
 * No header link — there's no /dashboard/customers?country=X view yet.
 * No footer link — same reason. v1.6 candidate.
 */
export function GeographicSpread() {
  const fetcher = useCallback(() => fetchGeographicSpread(), []);
  const { data, isLoading, error, refetch } = useWidgetData(fetcher);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error) return <WidgetError onRetry={refetch} />;
  if (!data || data.length === 0) {
    return (
      <WidgetEmpty message="No geographic data yet — customer addresses haven't synced or aren't available." />
    );
  }

  return (
    <div className="h-full min-h-0 overflow-auto flex flex-col gap-2.5">
      {data.slice(0, 8).map((country) => (
        <div key={country.country_code} className="flex items-center gap-3">
          <span className="text-2xl flex-shrink-0 leading-none" aria-hidden>
            {getFlagEmoji(country.country_code)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-baseline mb-1 gap-2">
              <span className="text-sm font-medium text-foreground truncate">
                {country.country_name}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                {formatNumber(country.customer_count)}
                <span className="text-muted-foreground/70 ml-1.5">
                  {country.percentage}%
                </span>
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.max(country.percentage, 2)}%` }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
