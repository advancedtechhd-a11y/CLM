import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a value with no decimals. e.g. 1234.56 → "$1,235". Currency code optional, defaults USD. */
export function formatCurrency(
  n: number | null | undefined,
  currency: string = "USD"
): string {
  if (n == null || !isFinite(n)) return "—";
  // Defensive: Intl rejects unknown currency codes. Fall back to USD on bad input.
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(n);
  }
}

/** Format a 0-1 fraction as a percentage. e.g. 0.234 → "23.4%" */
export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

/** Compact integer formatting. 1234 → "1,234" */
export function formatNumber(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US").format(n);
}
