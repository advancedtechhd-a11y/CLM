"use client";

import { useCallback } from "react";
import {
  ShoppingCart,
  Sparkles,
  Trash2,
  RefreshCw,
  Activity as ActivityIcon,
  type LucideIcon,
} from "lucide-react";
import { useWidgetData } from "@/hooks/use-widget-data";
import { fetchRecentActivity } from "@/app/actions/widget-data";
import { renderEventDescription } from "@/lib/events/render";
import { EVENT_TYPES, type EventType } from "@/lib/events/types";
import { formatRelativeTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { WidgetSkeleton, WidgetError, WidgetEmpty } from "./shared/WidgetStates";

/**
 * Recent Activity — last 20 events from the events table.
 *
 * Description text comes from the GDPR-safe lib/events/render.tsx — never
 * JOINs to customers/orders. If a customer is deleted, their entries still
 * render from the cached payload denormalization.
 *
 * No header link — there's no /dashboard/activity page yet. v1.6 candidate.
 */

type IconStyle = { icon: LucideIcon; tone: string; bg: string };

const STYLE_BY_TYPE: Record<EventType, IconStyle> = {
  [EVENT_TYPES.ORDER_CREATED]: {
    icon: ShoppingCart,
    tone: "text-success",
    bg: "bg-success/15",
  },
  [EVENT_TYPES.ORDER_FIRST]: {
    icon: Sparkles,
    tone: "text-primary",
    bg: "bg-primary/15",
  },
  [EVENT_TYPES.CART_ABANDONED]: {
    icon: Trash2,
    tone: "text-warning",
    bg: "bg-warning/15",
  },
  [EVENT_TYPES.CART_RECOVERED]: {
    icon: RefreshCw,
    tone: "text-success",
    bg: "bg-success/15",
  },
};

const FALLBACK_STYLE: IconStyle = {
  icon: ActivityIcon,
  tone: "text-muted-foreground",
  bg: "bg-muted",
};

export function RecentActivity() {
  const fetcher = useCallback(() => fetchRecentActivity(), []);
  const { data, isLoading, error, refetch } = useWidgetData(fetcher);

  if (isLoading) return <WidgetSkeleton rows={5} />;
  if (error) return <WidgetError onRetry={refetch} />;
  if (!data || data.length === 0)
    return (
      <WidgetEmpty message="No recent activity yet — events appear here as customers order, abandon carts, etc." />
    );

  return (
    <div className="h-full flex flex-col">
      <ul className="flex-1 min-h-0 overflow-auto flex flex-col gap-2 -mx-1 px-1">
        {data.map((event) => {
          const style =
            (STYLE_BY_TYPE as Record<string, IconStyle>)[event.event_type] ??
            FALLBACK_STYLE;
          const Icon = style.icon;
          const description = renderEventDescription(event);
          return (
            <li
              key={event.id}
              className="grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3 py-2 rounded-md hover:bg-muted/30 transition-colors"
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0",
                  style.bg
                )}
              >
                <Icon className={cn("w-3.5 h-3.5", style.tone)} />
              </div>
              <p className="text-sm text-foreground leading-tight truncate">
                {description}
              </p>
              <span className="text-xs text-muted-foreground tabular-nums flex-shrink-0">
                {formatRelativeTime(event.created_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
