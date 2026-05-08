/**
 * Convert ISO 3166-1 alpha-2 country code to its Unicode flag emoji.
 *
 * Works by mapping each ASCII letter to its Regional Indicator Symbol
 * (U+1F1E6 + offset), which browsers render as a flag.
 *
 * Returns "🌐" for unknown / null / malformed input — used as a fallback
 * in the GeographicSpread widget when a customer's country_code is missing.
 */

const REGIONAL_INDICATOR_BASE = 0x1f1e6;
const ASCII_A = 65;

export function getFlagEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const upper = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "🌐";
  const codePoints = [
    REGIONAL_INDICATOR_BASE + (upper.charCodeAt(0) - ASCII_A),
    REGIONAL_INDICATOR_BASE + (upper.charCodeAt(1) - ASCII_A),
  ];
  return String.fromCodePoint(...codePoints);
}
