/**
 * Country-aware public holiday detection for the seasonality stack.
 *
 * Two calendars combined:
 *   1. `date-holidays` — covers 150+ countries' standard observances
 *      (federal holidays, religious holidays that follow Gregorian dates,
 *      bank holidays, etc.).
 *   2. `hijri-converter` — Gregorian↔Hijri conversion. Used to detect
 *      Eid Al Fitr (1 Shawwal) and Eid Al Adha (10 Dhu al-Hijjah, plus the
 *      surrounding observance days) for the 14 countries listed below.
 *
 * Why hijri-converter NOT moment-hijri:
 *   moment-hijri requires moment.js (~67KB gzipped, deprecated). We only
 *   need one operation — Gregorian → Hijri date conversion — so a smaller
 *   modern alternative is the right call. hijri-converter is ~10KB, no
 *   transitive deps, TypeScript-friendly.
 *
 * Both packages are dynamically imported INSIDE checkPublicHoliday so they
 * don't bloat unrelated cron cold-starts. Only the detect-anomalies cron
 * triggers this code path.
 */

/**
 * Countries with significant Islamic holidays that shift annually on the
 * Gregorian calendar. The `date-holidays` package handles standard
 * observances for these too, but its Eid date detection is unreliable for
 * the years we care about — we use Hijri conversion as the source of truth.
 */
const ISLAMIC_HOLIDAY_COUNTRIES = new Set<string>([
  "AE", "SA", "KW", "QA", "BH", "OM", // GCC
  "EG", "JO", "MA",                    // North Africa / Levant
  "ID", "MY", "PK", "BD",              // South / Southeast Asia
  "TR",                                // Turkey
]);

/**
 * Returns true if the given Gregorian date is a public holiday in the
 * merchant's country. Uses both the standard calendar and (for the 14
 * countries above) the Hijri Eid windows.
 *
 * Returns false for null/unknown country_code.
 */
export async function checkPublicHoliday(
  countryCode: string | null,
  date: Date
): Promise<boolean> {
  if (!countryCode) return false;

  // Lazy-load: keeps unrelated cron routes' cold-start lean.
  const Holidays = (await import("date-holidays")).default;
  const hd = new Holidays(countryCode);
  const result = hd.isHoliday(date);
  // date-holidays returns false OR an array of holiday objects.
  // Anything truthy = holiday. We accept all types (public, bank, school)
  // because any of them is enough to widen anomaly thresholds.
  if (result !== false && Array.isArray(result) && result.length > 0) {
    return true;
  }

  // Islamic calendar overlay for the 14 countries above
  if (ISLAMIC_HOLIDAY_COUNTRIES.has(countryCode.toUpperCase())) {
    if (await isIslamicHoliday(date)) return true;
  }

  return false;
}

/**
 * Eid Al Fitr (1-3 Shawwal) and Eid Al Adha (10-13 Dhu al-Hijjah) windows.
 *
 * Many GCC + MENA + South Asian countries observe 3-4 days for each Eid;
 * we use the wider window so the anomaly threshold loosens for the entire
 * holiday period, not just the first day.
 *
 * Note: real-world Eid dates are determined by moon-sighting committees
 * and can shift ±1 day from the astronomical calendar. Acceptable for
 * threshold loosening — being one day off in EITHER direction just means
 * we're occasionally generous with the threshold around the boundary,
 * which is the desired failure mode (false negatives, not false positives).
 */
async function isIslamicHoliday(date: Date): Promise<boolean> {
  // Lazy-load
  const { toHijri } = await import("hijri-converter");

  const h = toHijri(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1, // hijri-converter uses 1-based months
    date.getUTCDate()
  );

  // Eid Al Fitr — 1 to 3 Shawwal (Hijri month 10)
  if (h.hm === 10 && h.hd >= 1 && h.hd <= 3) return true;

  // Eid Al Adha — 10 to 13 Dhu al-Hijjah (Hijri month 12)
  if (h.hm === 12 && h.hd >= 10 && h.hd <= 13) return true;

  return false;
}
