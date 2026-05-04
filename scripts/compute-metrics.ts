/**
 * Run the full rules engine pipeline for a merchant.
 *
 * Usage:
 *   npx tsx scripts/compute-metrics.ts <shop_domain>
 */

import { Client } from "pg";
import { config } from "dotenv";
import { runRulesEngine } from "../lib/rules/compute";

config({ path: ".env.local" });

async function main() {
  const shopArg = process.argv[2];
  if (!shopArg) {
    console.error("Usage: npx tsx scripts/compute-metrics.ts <shop_domain>");
    process.exit(1);
  }

  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const { rows } = await pg.query(
    "SELECT id FROM public.merchants WHERE shop_domain = $1 LIMIT 1",
    [shopArg]
  );
  if (rows.length === 0) {
    console.error(`No merchant found for ${shopArg}`);
    await pg.end();
    process.exit(1);
  }
  const merchantId = rows[0].id;

  console.log(`🧮 Running rules engine for ${shopArg} (${merchantId})\n`);

  try {
    const result = await runRulesEngine(pg, merchantId);

    console.log(`\n✅ Done in ${result.durationMs}ms\n`);
    console.log("=== MERCHANT METRICS ===");
    console.log(`   Total customers:           ${result.merchantMetrics.total_customers}`);
    console.log(`   Total orders:              ${result.merchantMetrics.total_orders}`);
    console.log(`   Total revenue:             $${result.merchantMetrics.total_revenue}`);
    console.log(`   Avg order value:           $${result.merchantMetrics.avg_order_value}`);
    console.log(`   Median repurchase cycle:   ${result.merchantMetrics.median_repurchase_days} days`);
    console.log(`   p75 repurchase:            ${result.merchantMetrics.p75_repurchase_days} days`);
    console.log(`   p90 repurchase:            ${result.merchantMetrics.p90_repurchase_days} days`);
    console.log(`   Repurchase sample size:    ${result.merchantMetrics.repurchase_sample_size}`);
    console.log(`   Repeat purchase rate:      ${(result.merchantMetrics.repeat_purchase_rate * 100).toFixed(1)}%`);
    console.log(`   1→2 conversion rate:       ${(result.merchantMetrics.first_to_second_conversion_rate * 100).toFixed(1)}%`);
    console.log(`   Median days to 2nd order:  ${result.merchantMetrics.median_days_to_second_purchase}`);
    console.log(`   Top 10% revenue share:     ${(result.merchantMetrics.top_10_pct_revenue_share * 100).toFixed(1)}%`);
    console.log(`   Concentration risk:        ${result.merchantMetrics.concentration_risk_level}`);
    console.log(`   Top 5 customers value:     $${result.merchantMetrics.top_5_customer_annual_value}`);
    console.log(`   Discount dependency:       ${(result.merchantMetrics.merchant_discount_dependency_pct * 100).toFixed(1)}%`);

    console.log("\n=== LIFECYCLE DISTRIBUTION ===");
    for (const [stage, count] of Object.entries(result.customerResult.lifecycleDistribution).sort()) {
      console.log(`   ${stage.padEnd(15)} ${count}`);
    }

    console.log("\n=== VALUE TIER DISTRIBUTION ===");
    for (const [tier, count] of Object.entries(result.customerResult.tierDistribution).sort()) {
      console.log(`   ${tier.padEnd(15)} ${count}`);
    }

    console.log("\n=== REVENUE AT RISK ===");
    console.log(`   Total at risk:             $${Math.round(result.revenueAtRisk.total_at_risk * 100) / 100}`);
    console.log(`   Estimated recoverable:     $${Math.round(result.revenueAtRisk.estimated_recoverable * 100) / 100}`);
    console.log(`   At-risk customer count:    ${result.revenueAtRisk.at_risk_customer_count}`);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
