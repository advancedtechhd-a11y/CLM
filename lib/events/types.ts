/**
 * Event type registry + payload contracts (v1.5 Phase 5).
 *
 * Adding a new event type requires:
 *   1. Add the constant to EVENT_TYPES below
 *   2. Add a payload shape to EventPayloadByType
 *   3. Add a render branch in lib/events/render.tsx
 *   4. Add the emit call where the state transition actually happens
 *
 * Payloads are denormalized at emit time — never JOIN at read time.
 * Critical for GDPR: deleting a customer must NOT break historical
 * activity entries.
 */

export const EVENT_TYPES = {
  ORDER_CREATED: "order.created",
  ORDER_FIRST: "order.first",
  CART_ABANDONED: "cart.abandoned",
  CART_RECOVERED: "cart.recovered",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ============================================================
// Payload shapes — what the render helper sees
// ============================================================

export type OrderEventPayload = {
  customer_name: string;
  customer_email: string | null;
  total: number;
  currency: string;
  order_number: string | null;
};

export type CartEventPayload = {
  customer_name: string | null;
  customer_email: string | null;
  total: number;
  currency: string;
};

export type EventPayloadByType = {
  [EVENT_TYPES.ORDER_CREATED]: OrderEventPayload;
  [EVENT_TYPES.ORDER_FIRST]: OrderEventPayload;
  [EVENT_TYPES.CART_ABANDONED]: CartEventPayload;
  [EVENT_TYPES.CART_RECOVERED]: CartEventPayload;
};

// ============================================================
// Row + emit shapes
// ============================================================

export type EventRow = {
  id: string;
  merchant_id: string;
  event_type: EventType;
  entity_type: string | null;
  entity_id: string | null;
  actor_type: string;
  actor_id: string | null;
  dedupe_key: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

export type EmitParams = {
  merchantId: string;
  eventType: EventType;
  entityType?: string;
  entityId?: string;
  /** When set, ON CONFLICT DO NOTHING dedupes retries. Recommended for any
   *  event that has a natural unique key (Shopify order ID, etc.). */
  dedupeKey?: string;
  actorType?: "system" | "merchant" | "customer";
  actorId?: string;
  payload: Record<string, unknown>;
};
