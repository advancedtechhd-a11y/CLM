"use server";

/**
 * Server actions backing the AnomaliesPanel widget (v1.5 Phase 6).
 *
 * Each action enforces RLS via the Supabase client (NOT raw pg.Client) so
 * a merchant can never modify another merchant's rows. revalidatePath on
 * /dashboard/grid so the widget re-fetches after a write.
 *
 * Two persistence layers:
 *   - public.merchants — for snooze (anomalies_snoozed_until)
 *   - public.anomalies — for dismiss / mark-normal flags
 *   - public.merchant_detected_sales — for sale confirm/correct/reject
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMerchant } from "@/lib/supabase/queries";

type ActionResult = { ok: boolean; message?: string };

async function requireMerchantId(): Promise<string> {
  const merchant = await getCurrentMerchant();
  if (!merchant) throw new Error("MERCHANT_NOT_FOUND");
  return merchant.id;
}

// ============================================================
// Snooze — sets merchants.anomalies_snoozed_until
// ============================================================

export async function snoozeAnomalies(days: number): Promise<ActionResult> {
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return { ok: false, message: "days must be 1-30" };
  }
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const until = new Date();
  until.setUTCDate(until.getUTCDate() + days);

  const { error } = await supabase
    .from("merchants")
    .update({ anomalies_snoozed_until: until.toISOString() })
    .eq("id", merchantId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/grid");
  return { ok: true };
}

export async function unsnoozeAnomalies(): Promise<ActionResult> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("merchants")
    .update({ anomalies_snoozed_until: null })
    .eq("id", merchantId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/grid");
  return { ok: true };
}

// ============================================================
// Per-anomaly actions: dismiss, mark-normal
// ============================================================

export async function dismissAnomaly(anomalyId: string): Promise<ActionResult> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  // .eq("merchant_id", merchantId) is defense-in-depth — RLS already enforces it.
  const { error } = await supabase
    .from("anomalies")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", anomalyId)
    .eq("merchant_id", merchantId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/grid");
  return { ok: true };
}

/**
 * Mark this anomaly as "actually normal" — feedback signal for future
 * detector tuning. Optionally suppress similar anomalies for `ignoreDays`.
 */
export async function markAnomalyNormal(
  anomalyId: string,
  ignoreDays: number = 0
): Promise<ActionResult> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const update: Record<string, string | null> = {
    marked_normal_at: new Date().toISOString(),
    dismissed_at: new Date().toISOString(), // also remove from active list
  };
  if (ignoreDays > 0) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + ignoreDays);
    update.ignore_until = until.toISOString();
  }

  const { error } = await supabase
    .from("anomalies")
    .update(update)
    .eq("id", anomalyId)
    .eq("merchant_id", merchantId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/grid");
  return { ok: true };
}

// ============================================================
// Sale-detection confirmation — persists to merchant_detected_sales
// ============================================================

export async function confirmDetectedSale(
  detectedSaleId: string
): Promise<ActionResult> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("merchant_detected_sales")
    .update({
      merchant_confirmation: "confirmed",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", detectedSaleId)
    .eq("merchant_id", merchantId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/grid");
  return { ok: true };
}

export async function correctDetectedSale(
  detectedSaleId: string,
  confirmedStart: string, // YYYY-MM-DD
  confirmedEnd: string
): Promise<ActionResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedStart) || !/^\d{4}-\d{2}-\d{2}$/.test(confirmedEnd)) {
    return { ok: false, message: "Dates must be YYYY-MM-DD" };
  }
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("merchant_detected_sales")
    .update({
      merchant_confirmation: "corrected",
      confirmed_start: confirmedStart,
      confirmed_end: confirmedEnd,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", detectedSaleId)
    .eq("merchant_id", merchantId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/grid");
  return { ok: true };
}

export async function rejectDetectedSale(
  detectedSaleId: string
): Promise<ActionResult> {
  const merchantId = await requireMerchantId();
  const supabase = await createClient();

  const { error } = await supabase
    .from("merchant_detected_sales")
    .update({
      merchant_confirmation: "rejected",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", detectedSaleId)
    .eq("merchant_id", merchantId);

  if (error) return { ok: false, message: error.message };
  revalidatePath("/dashboard/grid");
  return { ok: true };
}
