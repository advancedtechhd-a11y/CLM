/**
 * Threshold layering for the seasonality detector (v1.5 Phase 6).
 *
 * Determines which σ multiplier to use for the day's z-score test.
 * Order matters — first match wins:
 *
 *   1. snoozed         → return null (skip detection entirely)
 *   2. sale_detected   → 5σ (tolerate up to 5 standard deviations of noise)
 *   3. public_holiday  → 4σ
 *   4. normal          → 3σ
 *
 * Sale detection runs INSIDE this function (calls detectSale). If the
 * sale-detector found ≥2 signals, it has also already persisted a row to
 * merchant_detected_sales as 'pending'. The threshold only checks for
 * presence — it doesn't re-run the detection.
 */

import type { Client } from "pg";
import type { ThresholdResult } from "./types";
import { detectSale } from "./sale-detector";
import { checkPublicHoliday } from "./holiday-calendar";

const SIGMA_NORMAL = 3.0;
const SIGMA_HOLIDAY = 4.0;
const SIGMA_SALE = 5.0;

export async function determineThreshold(
  pg: Client,
  merchantId: string,
  date: Date
): Promise<ThresholdResult> {
  const merchantRow = await pg.query<{
    country_code: string | null;
    anomalies_snoozed_until: string | null;
  }>(
    `SELECT country_code, anomalies_snoozed_until
     FROM public.merchants
     WHERE id = $1`,
    [merchantId]
  );
  if (merchantRow.rows.length === 0) return null;
  const m = merchantRow.rows[0];

  // 1. SNOOZED → skip the whole detection for this merchant
  if (m.anomalies_snoozed_until && new Date(m.anomalies_snoozed_until) > date) {
    return null;
  }

  // 2. SALE → 5σ. Side-effect: detectSale persists to merchant_detected_sales
  //          on first detection; the merchant confirms via the widget.
  const sale = await detectSale(pg, merchantId, date);
  if (sale) {
    return { value: SIGMA_SALE, reason: "sale_detected" };
  }

  // 3. PUBLIC HOLIDAY → 4σ. Country-aware; checks both standard calendar
  //    (date-holidays) and Hijri for 14 Islamic-calendar countries.
  if (await checkPublicHoliday(m.country_code, date)) {
    return { value: SIGMA_HOLIDAY, reason: "public_holiday" };
  }

  // 4. NORMAL → 3σ
  return { value: SIGMA_NORMAL, reason: "normal" };
}
