/**
 * Pure event-payload → human-readable description (v1.5 Phase 5).
 *
 * CRITICAL CONSTRAINT: this module reads ONLY from event.payload. It does
 * NOT query customers, orders, or any other table. GDPR rationale:
 *
 *   When a customer requests deletion under GDPR / right-to-be-forgotten,
 *   we anonymize their row. Their historical activity entries should still
 *   render from the cached payload (which can also be scrubbed via a
 *   targeted UPDATE if/when needed). Joining at read time would either
 *   crash on null FK or leak deleted customer's name back into UI.
 *
 * If you find yourself wanting to JOIN here, the right move is to add the
 * needed field to the emit-time payload denormalization in lib/events/emit
 * callers — NOT to JOIN at read time.
 */

import { formatCurrency } from "@/lib/utils";
import { EVENT_TYPES, type EventRow, type EventType } from "./types";

const EVENT_TYPE_VALUES = Object.values(EVENT_TYPES) as EventType[];

export function renderEventDescription(event: EventRow): string {
  const p = event.payload as Record<string, unknown>;

  switch (event.event_type) {
    case EVENT_TYPES.ORDER_CREATED: {
      const name = (p.customer_name as string | undefined) ?? "A customer";
      const total = numberFromPayload(p.total);
      const currency = (p.currency as string | undefined) ?? "USD";
      return `${name} placed an order — ${formatCurrency(total, currency)}`;
    }
    case EVENT_TYPES.ORDER_FIRST: {
      const name = (p.customer_name as string | undefined) ?? "A new customer";
      const total = numberFromPayload(p.total);
      const currency = (p.currency as string | undefined) ?? "USD";
      return `${name} placed their first order — ${formatCurrency(total, currency)}`;
    }
    case EVENT_TYPES.CART_ABANDONED: {
      const name = (p.customer_name as string | undefined) ?? "A customer";
      const total = numberFromPayload(p.total);
      const currency = (p.currency as string | undefined) ?? "USD";
      return `${name} abandoned a cart — ${formatCurrency(total, currency)}`;
    }
    case EVENT_TYPES.CART_RECOVERED: {
      const name = (p.customer_name as string | undefined) ?? "A customer";
      return `${name} completed an abandoned cart`;
    }
    default:
      return event.event_type;
  }
}

/** Returns the EventType this row represents if recognised, else null. */
export function asKnownEventType(event_type: string): EventType | null {
  return (EVENT_TYPE_VALUES as string[]).includes(event_type)
    ? (event_type as EventType)
    : null;
}

function numberFromPayload(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
