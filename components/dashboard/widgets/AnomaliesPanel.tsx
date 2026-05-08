"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  X,
  Bell,
  BellOff,
  Sparkles,
} from "lucide-react";
import { useWidgetData } from "@/hooks/use-widget-data";
import {
  fetchAnomaliesPanel,
  type AnomaliesPanelActiveAnomaly,
  type AnomaliesPanelPendingSale,
} from "@/app/actions/widget-data";
import {
  snoozeAnomalies,
  unsnoozeAnomalies,
  dismissAnomaly,
  markAnomalyNormal,
  confirmDetectedSale,
  rejectDetectedSale,
} from "@/app/actions/anomalies";
import { formatRelativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WidgetSkeleton, WidgetError } from "./shared/WidgetStates";
import { useSetWidgetSubtitle } from "../widget-subtitle-context";

const SNOOZE_DAYS = 7;

/**
 * AnomaliesPanel — pending-sale confirmation card at top, active anomaly
 * list, snooze button in the widget header, "all clear" empty state.
 *
 * UX patterns:
 *   - Snooze persists to merchants.anomalies_snoozed_until via server
 *     action — page refresh shows the snoozed state.
 *   - Sale-detection card only renders while merchant_confirmation =
 *     'pending'. Click any of the 3 buttons → optimistic hide + await
 *     server action that flips the row.
 *   - Per-anomaly dismiss is also optimistic + persisted.
 *   - "All clear" state when no active anomalies AND no pending sale.
 */
export function AnomaliesPanel() {
  const fetcher = useCallback(() => fetchAnomaliesPanel(), []);
  const { data, isLoading, error, refetch } = useWidgetData(fetcher);
  const setSubtitle = useSetWidgetSubtitle();
  const [isPending, startTransition] = useTransition();

  // Optimistic hides — keyed sets so we can hide before server roundtrip
  const [hiddenAnomalyIds, setHiddenAnomalyIds] = useState<Set<string>>(new Set());
  const [saleHidden, setSaleHidden] = useState(false);

  // Reset optimistic state on real data refresh
  useEffect(() => {
    setHiddenAnomalyIds(new Set());
    setSaleHidden(false);
  }, [data]);

  const isSnoozed =
    data?.snoozed_until && new Date(data.snoozed_until) > new Date();

  useEffect(() => {
    if (!data) {
      setSubtitle(null);
      return;
    }
    if (isSnoozed) {
      const until = new Date(data.snoozed_until!);
      setSubtitle(`Snoozed until ${until.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`);
    } else {
      const visibleCount = (data.active_anomalies ?? []).filter(
        (a) => !hiddenAnomalyIds.has(a.id)
      ).length;
      setSubtitle(visibleCount > 0 ? `${visibleCount} active · last 7d` : "All clear");
    }
    return () => setSubtitle(null);
  }, [data, hiddenAnomalyIds, isSnoozed, setSubtitle]);

  if (isLoading) return <WidgetSkeleton rows={4} />;
  if (error) return <WidgetError onRetry={refetch} />;
  if (!data) return <WidgetError onRetry={refetch} />;

  if (!data.enabled) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6">
        <Bell className="w-6 h-6 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          Anomaly detection is off
        </p>
        <p className="text-xs text-muted-foreground">
          Reach out to support to opt in to seasonality-aware alerts.
        </p>
      </div>
    );
  }

  const visibleAnomalies = (data.active_anomalies ?? []).filter(
    (a) => !hiddenAnomalyIds.has(a.id)
  );
  const showSaleCard = !!data.pending_sale && !saleHidden && !isSnoozed;
  const allClear = visibleAnomalies.length === 0 && !showSaleCard && !isSnoozed;

  // ── Snooze handlers ────────────────────────────────────
  const handleSnooze = () => {
    startTransition(async () => {
      await snoozeAnomalies(SNOOZE_DAYS);
      refetch();
    });
  };
  const handleUnsnooze = () => {
    startTransition(async () => {
      await unsnoozeAnomalies();
      refetch();
    });
  };

  // ── Sale card handlers (optimistic hide + persist) ─────
  const handleConfirmSale = () => {
    if (!data.pending_sale) return;
    setSaleHidden(true);
    startTransition(async () => {
      await confirmDetectedSale(data.pending_sale!.id);
      refetch();
    });
  };
  const handleRejectSale = () => {
    if (!data.pending_sale) return;
    setSaleHidden(true);
    startTransition(async () => {
      await rejectDetectedSale(data.pending_sale!.id);
      refetch();
    });
  };

  // ── Per-anomaly handlers (optimistic hide + persist) ───
  const handleDismiss = (id: string) => {
    setHiddenAnomalyIds((s) => new Set(s).add(id));
    startTransition(async () => {
      await dismissAnomaly(id);
      refetch();
    });
  };
  const handleMarkNormal = (id: string) => {
    setHiddenAnomalyIds((s) => new Set(s).add(id));
    startTransition(async () => {
      await markAnomalyNormal(id, 7); // suppress similar for 7 days
      refetch();
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto flex flex-col gap-2.5">
        {/* Sale-detection confirmation card — only while pending */}
        {showSaleCard && data.pending_sale && (
          <SaleCard
            sale={data.pending_sale}
            onConfirm={handleConfirmSale}
            onReject={handleRejectSale}
            disabled={isPending}
          />
        )}

        {/* Snoozed banner */}
        {isSnoozed && (
          <div className="rounded-md border border-border bg-muted/40 p-3 flex items-start gap-3">
            <BellOff className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">
                Anomaly alerts snoozed
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Resumes {new Date(data.snoozed_until!).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7"
              onClick={handleUnsnooze}
              disabled={isPending}
            >
              Resume now
            </Button>
          </div>
        )}

        {/* All-clear state */}
        {allClear && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-2 px-6 py-8">
            <CheckCircle2 className="w-7 h-7 text-success" />
            <p className="text-sm font-medium text-foreground">All clear</p>
            <p className="text-xs text-muted-foreground">
              No anomalies detected in the last 7 days.
            </p>
          </div>
        )}

        {/* Active anomaly list */}
        {!isSnoozed &&
          visibleAnomalies.map((a) => (
            <AnomalyCard
              key={a.id}
              anomaly={a}
              onDismiss={() => handleDismiss(a.id)}
              onMarkNormal={() => handleMarkNormal(a.id)}
              disabled={isPending}
            />
          ))}
      </div>

      {/* Sticky footer — snooze action + count */}
      <div className="flex-shrink-0 pt-2 mt-2 border-t border-border flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {isSnoozed
            ? "Alerts paused"
            : visibleAnomalies.length > 0
              ? `${visibleAnomalies.length} active · last 7d`
              : "Monitoring 6 metrics"}
        </span>
        {!isSnoozed && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={handleSnooze}
            disabled={isPending}
          >
            <BellOff className="w-3 h-3 mr-1" />
            Snooze {SNOOZE_DAYS}d
          </Button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Sale confirmation card
// ============================================================

function SaleCard({
  sale,
  onConfirm,
  onReject,
  disabled,
}: {
  sale: AnomaliesPanelPendingSale;
  onConfirm: () => void;
  onReject: () => void;
  disabled: boolean;
}) {
  const start = new Date(sale.detected_start).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const end =
    sale.detected_start === sale.detected_end
      ? null
      : new Date(sale.detected_end).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
  const dateRange = end ? `${start} – ${end}` : start;

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-start gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            Sale detected on {dateRange}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sale.signals_matched.length} signal
            {sale.signals_matched.length === 1 ? "" : "s"} matched · anomaly
            alerts widened during this window. Confirm so we tune future
            detections.
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" className="h-8 text-xs" onClick={onConfirm} disabled={disabled}>
          <Check className="w-3 h-3 mr-1" />
          Confirm
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={onReject}
          disabled={disabled}
        >
          <X className="w-3 h-3 mr-1" />
          Wasn&apos;t a sale
        </Button>
      </div>
    </div>
  );
}

// ============================================================
// Anomaly row card
// ============================================================

const SEVERITY_TONE: Record<string, string> = {
  high: "border-destructive/30 bg-destructive/5",
  medium: "border-warning/30 bg-warning/5",
  low: "border-border bg-muted/40",
};

const SEVERITY_ICON_TONE: Record<string, string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-muted-foreground",
};

function AnomalyCard({
  anomaly,
  onDismiss,
  onMarkNormal,
  disabled,
}: {
  anomaly: AnomaliesPanelActiveAnomaly;
  onDismiss: () => void;
  onMarkNormal: () => void;
  disabled: boolean;
}) {
  const tone = SEVERITY_TONE[anomaly.severity] ?? SEVERITY_TONE.low;
  const iconTone = SEVERITY_ICON_TONE[anomaly.severity] ?? SEVERITY_ICON_TONE.low;

  return (
    <div className={cn("rounded-md border p-3", tone)}>
      <div className="flex items-start gap-2 mb-2">
        <AlertTriangle className={cn("w-4 h-4 flex-shrink-0 mt-0.5", iconTone)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground leading-tight">
            {anomaly.description ?? `Anomaly in ${anomaly.metric}`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatRelativeTime(anomaly.detected_at)} ·{" "}
            {anomaly.deviation_sigma !== null
              ? `${anomaly.deviation_sigma.toFixed(1)}σ`
              : "—"}
            {anomaly.detection_reason && anomaly.detection_reason !== "normal" && (
              <> · {anomaly.detection_reason.replace(/_/g, " ")}</>
            )}
          </p>
        </div>
      </div>
      <div className="flex gap-2 mt-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onDismiss}
          disabled={disabled}
        >
          Dismiss
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={onMarkNormal}
          disabled={disabled}
        >
          This is normal
        </Button>
      </div>
    </div>
  );
}
