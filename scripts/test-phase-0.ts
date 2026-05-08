/**
 * Phase 0 smoke test — verifies the v1.5 foundational pure helpers.
 *
 * Run with:
 *   npx tsx scripts/test-phase-0.ts
 *
 * Tests SQL helpers (lib/metrics/queries, lib/cohorts/queries) live
 * implicitly in Phase 3/4 when their crons run against the DB.
 */

import { mean, median, percentile, standardDeviation, daysBetween } from "../lib/rules/stats";
import {
  yesterday,
  getLastNMonths,
  formatRelativeTime,
  formatMonth,
  startOfMonth,
  startOfNextMonth,
} from "../lib/dates";
import { getFlagEmoji } from "../lib/utils/flags";

let passed = 0;
let failed = 0;

function assert(label: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

console.log("\n📊 lib/rules/stats (extended)");
assert("mean([1,2,3,4,5]) = 3", mean([1, 2, 3, 4, 5]) === 3);
assert("mean([]) = 0", mean([]) === 0);
assert("median([1,2,3,4,5]) = 3", median([1, 2, 3, 4, 5]) === 3);
assert("median([1,2,3,4]) = 2.5", median([1, 2, 3, 4]) === 2.5);
assert("percentile([1..10], 50) = 5.5", percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50) === 5.5);
assert("standardDeviation([2,4,4,4,5,5,7,9]) ≈ 2.138", approx(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]), 2.138, 0.01));
assert("standardDeviation([5,5,5,5]) = 0 (no variance)", standardDeviation([5, 5, 5, 5]) === 0);
assert("standardDeviation([]) = 0", standardDeviation([]) === 0);
assert("standardDeviation([42]) = 0 (single sample)", standardDeviation([42]) === 0);
assert(
  "daysBetween('2026-05-01','2026-05-08') = 7",
  daysBetween("2026-05-01", "2026-05-08") === 7
);

console.log("\n📅 lib/dates");
const now = new Date(Date.UTC(2026, 4, 8, 14, 30, 0)); // 2026-05-08 14:30 UTC
const y = yesterday(now);
assert(
  "yesterday('2026-05-08') = 2026-05-07 (UTC midnight)",
  y.toISOString().startsWith("2026-05-07T00:00:00")
);

const last3 = getLastNMonths(3, now);
assert(
  "getLastNMonths(3, May 2026) returns Mar/Apr/May",
  last3.length === 3 &&
    last3[0].toISOString().startsWith("2026-03-01") &&
    last3[1].toISOString().startsWith("2026-04-01") &&
    last3[2].toISOString().startsWith("2026-05-01")
);

const fiveMin = new Date(now.getTime() - 5 * 60 * 1000);
assert("formatRelativeTime(5min ago) = '5m ago'", formatRelativeTime(fiveMin, now) === "5m ago");
const threeHr = new Date(now.getTime() - 3 * 60 * 60 * 1000);
assert("formatRelativeTime(3h ago) = '3h ago'", formatRelativeTime(threeHr, now) === "3h ago");
const fiveDay = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
assert("formatRelativeTime(5d ago) = '5d ago'", formatRelativeTime(fiveDay, now) === "5d ago");
const justNow = new Date(now.getTime() - 30 * 1000);
assert("formatRelativeTime(30s ago) = 'just now'", formatRelativeTime(justNow, now) === "just now");
const twoMo = new Date(now.getTime() - 65 * 24 * 60 * 60 * 1000);
assert("formatRelativeTime(65d ago) = '2mo ago'", formatRelativeTime(twoMo, now) === "2mo ago");

assert("formatMonth(2026-04-15) = 'Apr 2026'", formatMonth(new Date(Date.UTC(2026, 3, 15))) === "Apr 2026");

const som = startOfMonth(new Date(Date.UTC(2026, 4, 15)));
assert(
  "startOfMonth(2026-05-15) = 2026-05-01",
  som.toISOString().startsWith("2026-05-01T00:00:00")
);
const sonm = startOfNextMonth(new Date(Date.UTC(2026, 4, 15)));
assert(
  "startOfNextMonth(2026-05-15) = 2026-06-01",
  sonm.toISOString().startsWith("2026-06-01T00:00:00")
);

console.log("\n🏳️  lib/utils/flags");
assert("getFlagEmoji('US') = 🇺🇸", getFlagEmoji("US") === "🇺🇸");
assert("getFlagEmoji('AE') = 🇦🇪", getFlagEmoji("AE") === "🇦🇪");
assert("getFlagEmoji('GB') = 🇬🇧", getFlagEmoji("GB") === "🇬🇧");
assert("getFlagEmoji('DE') = 🇩🇪", getFlagEmoji("DE") === "🇩🇪");
assert("getFlagEmoji('jp') = 🇯🇵 (lowercase ok)", getFlagEmoji("jp") === "🇯🇵");
assert("getFlagEmoji(null) = 🌐 fallback", getFlagEmoji(null) === "🌐");
assert("getFlagEmoji('') = 🌐 fallback", getFlagEmoji("") === "🌐");
assert("getFlagEmoji('USA') = 🌐 (wrong length)", getFlagEmoji("USA") === "🌐");
assert("getFlagEmoji('U1') = 🌐 (non-letter)", getFlagEmoji("U1") === "🌐");

console.log(`\n${"=".repeat(40)}`);
console.log(`Phase 0 smoke test: ${passed} passed, ${failed} failed`);
console.log("=".repeat(40));
process.exit(failed > 0 ? 1 : 0);
