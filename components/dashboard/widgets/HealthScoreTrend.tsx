"use client";

import { useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useWidgetData } from "@/hooks/use-widget-data";
import { fetchHealthScoreTrend } from "@/app/actions/widget-data";
import { useSetWidgetSubtitle } from "../widget-subtitle-context";
import { WidgetSkeleton, WidgetError, WidgetEmpty } from "./shared/WidgetStates";
import { DeltaPill } from "./shared/Pills";

const POLL_MS = 30_000;

/**
 * Health Score Trend — last 30 days of avg_health_score.
 *
 * On a fresh install, customer_health_history doesn't have historical
 * snapshots yet → /api/internal/backfill-health-history reconstructs them.
 * While that's running (merchants.health_backfill_status = 'in_progress'),
 * we render a "Calculating..." placeholder and poll every 30s. Once the
 * status flips to 'complete', the next fetch returns real data.
 */
export function HealthScoreTrend() {
  const fetcher = useCallback(() => fetchHealthScoreTrend(), []);
  const { data, isLoading, error, refetch } = useWidgetData(fetcher);
  const setSubtitle = useSetWidgetSubtitle();

  const isBackfilling =
    data?.backfill_status === "in_progress" || data?.backfill_status === "pending";

  // Poll while the backfill is running so the widget swaps to real data
  // automatically when reconstruction finishes.
  useEffect(() => {
    if (!isBackfilling) return;
    const interval = setInterval(() => {
      refetch();
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [isBackfilling, refetch]);

  useEffect(() => {
    if (!data || data.thirty_day_avg === null) {
      setSubtitle(null);
      return;
    }
    setSubtitle(`Last 30 days · avg ${data.thirty_day_avg.toFixed(0)}`);
    return () => setSubtitle(null);
  }, [data, setSubtitle]);

  if (isLoading) return <WidgetSkeleton rows={6} />;
  if (error) return <WidgetError onRetry={refetch} />;

  // Backfill in flight — friendlier than an empty state on day 1
  if (isBackfilling) {
    const completed = data?.backfill_chunks_completed ?? 0;
    const total = data?.backfill_chunks_total ?? 9;
    // Each chunk = 10 days. Total days = total * 10. Days done = completed * 10.
    const daysDone = completed * 10;
    const daysTotal = total * 10;
    const pctComplete = daysTotal > 0 ? (daysDone / daysTotal) * 100 : 0;

    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-3 px-6">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
        <div className="w-full max-w-[280px]">
          <p className="text-sm font-medium text-foreground">
            Calculating your customer health history...
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 tabular-nums">
            Day {daysDone} of {daysTotal}
          </p>
          <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-500"
              style={{ width: `${Math.max(2, pctComplete)}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            The trend will appear automatically when complete.
          </p>
        </div>
      </div>
    );
  }

  if (data?.backfill_status === "failed") {
    return (
      <WidgetError
        message="Health history backfill failed — re-run scripts/run-historical-health-backfill.ts to retry."
        onRetry={refetch}
      />
    );
  }

  const populated = data?.points.filter((p) => p.value !== null).length ?? 0;
  if (!data || populated < 7) {
    return (
      <WidgetEmpty message="Need at least 7 days of health data — the trend will fill in as the nightly job runs." />
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-baseline justify-between mb-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            Current
          </div>
          <div className="text-2xl font-semibold text-foreground tabular-nums">
            {data.current !== null ? data.current.toFixed(0) : "—"}
          </div>
        </div>
        <div className="flex flex-col items-end">
          <div className="text-xs text-muted-foreground uppercase tracking-wider font-medium">
            7-day vs prior 7
          </div>
          <DeltaPill value={data.delta} />
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data.points}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => {
                const dt = new Date(d);
                return `${dt.getMonth() + 1}/${dt.getDate()}`;
              }}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(label) => {
                if (typeof label !== "string") return "";
                return new Date(label).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                });
              }}
              formatter={(value) => {
                if (value === null || value === undefined) return ["—", "Health"];
                return [
                  typeof value === "number" ? value.toFixed(0) : String(value),
                  "Avg health",
                ];
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
