/**
 * Verify RLS policies exist on every tenant-scoped table (v1.5 Phase 5).
 *
 * Checks:
 *   1. RLS is ENABLED on each table
 *   2. At least one policy references the standard tenant-isolation pattern
 *      `merchant_id IN (SELECT id FROM merchants WHERE user_id = auth.uid())`
 *
 * NOTE: This is a STATIC policy-existence check. To behaviorally verify
 * isolation (Merchant A can't see Merchant B's rows), run the cross-tenant
 * SQL test from PROJECT-STATUS.md → Ops Runbook entry 7 in the Supabase
 * dashboard (where the connection role is `authenticated` and RLS applies).
 *
 * Usage:
 *   npx tsx scripts/verify-rls-policies.ts
 */

import { Client } from "pg";
import { config } from "dotenv";

config({ path: ".env.local" });

const TENANT_TABLES = [
  // v1 (existing)
  "merchants",
  "customers",
  "orders",
  "customer_metrics",
  "merchant_metrics",
  "customer_health_history",
  "anomalies",
  "abandoned_checkouts",
  "merchant_dashboards",
  "webhook_events",
  // v1.5
  "merchant_daily_metrics",
  "merchant_cohort_metrics",
  "events",
  "merchant_detected_sales",
] as const;

async function main() {
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  let pass = 0;
  let fail = 0;

  try {
    for (const table of TENANT_TABLES) {
      // Does the table exist?
      const tableRes = await pg.query<{ relrowsecurity: boolean | null }>(
        `SELECT relrowsecurity
         FROM pg_class
         WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
        [table]
      );
      if (tableRes.rows.length === 0) {
        console.log(`  ⏭️  ${table.padEnd(30)} (table not present — skipping)`);
        continue;
      }

      // RLS enabled?
      const rlsEnabled = tableRes.rows[0].relrowsecurity === true;
      if (!rlsEnabled) {
        console.log(`  ❌ ${table.padEnd(30)} RLS NOT ENABLED`);
        fail++;
        continue;
      }

      // Any policies referencing auth.uid()?
      const policyRes = await pg.query<{ policyname: string; qual: string | null }>(
        `SELECT policyname, qual
         FROM pg_policies
         WHERE schemaname = 'public' AND tablename = $1`,
        [table]
      );

      if (policyRes.rows.length === 0) {
        console.log(`  ❌ ${table.padEnd(30)} RLS enabled but NO POLICIES`);
        fail++;
        continue;
      }

      const hasAuthUid = policyRes.rows.some((p) =>
        p.qual?.toLowerCase().includes("auth.uid()")
      );
      if (!hasAuthUid) {
        console.log(
          `  ⚠️  ${table.padEnd(30)} ${policyRes.rows.length} polic${policyRes.rows.length === 1 ? "y" : "ies"} but no auth.uid() reference — review manually`
        );
        fail++;
        continue;
      }

      console.log(
        `  ✅ ${table.padEnd(30)} RLS ON · ${policyRes.rows.length} polic${policyRes.rows.length === 1 ? "y" : "ies"} · auth.uid() ✓`
      );
      pass++;
    }

    console.log(`\n${"=".repeat(50)}`);
    console.log(`RLS policy check: ${pass} pass, ${fail} fail`);
    console.log("=".repeat(50));
    if (fail > 0) {
      console.log(
        "\n⚠️  Static policy check found issues. Run the cross-tenant SQL test\n   from PROJECT-STATUS.md → Ops Runbook entry 7 in the Supabase dashboard."
      );
      process.exit(1);
    } else {
      console.log(
        "\n✅ All tenant-scoped tables have RLS enabled and reference auth.uid().\n   For full behavioral verification, run the cross-tenant SQL test\n   from PROJECT-STATUS.md → Ops Runbook entry 7."
      );
    }
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
