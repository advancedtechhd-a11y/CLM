/**
 * Seed Shopify dev store with realistic test data.
 *
 * Creates customers + orders with a controlled lifecycle distribution
 * so we can test our pipeline end-to-end.
 *
 * Usage:
 *   npx tsx scripts/seed-shopify-dev-store.ts <shop_domain>
 *
 * Example:
 *   npx tsx scripts/seed-shopify-dev-store.ts lifecycle-dev-test.myshopify.com
 *
 * Reads the merchant's access token from the public.merchants table.
 */

import { Client } from "pg";
import { faker } from "@faker-js/faker";
import { ShopifyAdminClient } from "../lib/shopify/admin-api";
import { decryptToken } from "../lib/shopify/oauth";
import { config } from "dotenv";

config({ path: ".env.local" });

// ============================================================
// Configuration — adjust as needed
// ============================================================
const NUM_CUSTOMERS = 80;             // Total fake customers to create
const MAX_ORDERS_PER_CUSTOMER = 8;    // Cap on orders per customer
const DAYS_BACK = 540;                // ~18 months of history

// Cohort distribution (must sum to ~1.0)
const COHORTS = [
  { name: "active_loyal",    pct: 0.15, ordersRange: [4, 8],  cycleDaysAvg: 35,  lastOrderDaysAgo: 20 },
  { name: "active_regular",  pct: 0.20, ordersRange: [2, 3],  cycleDaysAvg: 45,  lastOrderDaysAgo: 25 },
  { name: "new_customer",    pct: 0.15, ordersRange: [1, 1],  cycleDaysAvg: 0,   lastOrderDaysAgo: 15 },
  { name: "slipping",        pct: 0.10, ordersRange: [2, 4],  cycleDaysAvg: 40,  lastOrderDaysAgo: 65 },
  { name: "at_risk",         pct: 0.12, ordersRange: [2, 5],  cycleDaysAvg: 38,  lastOrderDaysAgo: 110 },
  { name: "churned",         pct: 0.13, ordersRange: [1, 4],  cycleDaysAvg: 40,  lastOrderDaysAgo: 220 },
  { name: "one_and_done",    pct: 0.15, ordersRange: [1, 1],  cycleDaysAvg: 0,   lastOrderDaysAgo: 200 },
];

// ============================================================
// Helpers
// ============================================================
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickCohort(): typeof COHORTS[number] {
  const r = Math.random();
  let cum = 0;
  for (const c of COHORTS) {
    cum += c.pct;
    if (r <= cum) return c;
  }
  return COHORTS[COHORTS.length - 1];
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function isoDate(d: Date): string {
  return d.toISOString();
}

// ============================================================
// Main
// ============================================================
async function main() {
  const shopArg = process.argv[2];
  if (!shopArg) {
    console.error("Usage: npx tsx scripts/seed-shopify-dev-store.ts <shop_domain>");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  // Fetch merchant + decrypt token
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  const { rows: merchants } = await pg.query(
    "SELECT shop_domain, access_token_encrypted FROM public.merchants WHERE shop_domain = $1 LIMIT 1",
    [shopArg]
  );

  if (merchants.length === 0) {
    console.error(`No merchant found with shop_domain = ${shopArg}`);
    console.error("Make sure the app is installed on this shop first.");
    await pg.end();
    process.exit(1);
  }

  const accessToken = decryptToken(merchants[0].access_token_encrypted);
  await pg.end();

  const client = new ShopifyAdminClient({
    shop: shopArg,
    accessToken,
  });

  // Step 1 — fetch existing products from the store (we'll order these)
  console.log("📦 Fetching products from store...");
  const productsResp = await client.get<{ products: ShopifyProduct[] }>("/products.json?limit=50");
  const products = productsResp.products.filter((p) => p.variants && p.variants.length > 0);

  if (products.length === 0) {
    console.error("❌ No products with variants found. Cannot seed orders.");
    process.exit(1);
  }
  console.log(`✅ Found ${products.length} products with variants\n`);

  // Step 2 — create customers + orders per cohort
  let totalCustomers = 0;
  let totalOrders = 0;
  const cohortCounts: Record<string, number> = {};

  console.log(`🌱 Seeding ${NUM_CUSTOMERS} customers across cohorts...\n`);

  for (let i = 0; i < NUM_CUSTOMERS; i++) {
    const cohort = pickCohort();
    cohortCounts[cohort.name] = (cohortCounts[cohort.name] ?? 0) + 1;

    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet
      .email({ firstName, lastName, provider: "lifecycletest.example" })
      .toLowerCase();

    // Create customer
    let customer: ShopifyCustomer;
    try {
      const resp = await client.post<{ customer: ShopifyCustomer }>("/customers.json", {
        customer: {
          first_name: firstName,
          last_name: lastName,
          email,
          tags: `seed,cohort_${cohort.name}`,
          email_marketing_consent:
            Math.random() > 0.3
              ? { state: "subscribed", opt_in_level: "single_opt_in", consent_updated_at: new Date().toISOString() }
              : undefined,
        },
      });
      customer = resp.customer;
    } catch (err) {
      console.error(`  ⚠️  Failed to create customer ${email}:`, (err as Error).message);
      continue;
    }

    totalCustomers++;
    process.stdout.write(`  [${i + 1}/${NUM_CUSTOMERS}] ${cohort.name.padEnd(15)} ${email}`);

    // Create N orders for this customer based on cohort
    const numOrders = randInt(cohort.ordersRange[0], cohort.ordersRange[1]);
    let lastOrderDate = daysAgo(cohort.lastOrderDaysAgo);
    const orderDates: Date[] = [lastOrderDate];

    // Build older order dates working backwards
    for (let j = 1; j < numOrders; j++) {
      const prevDate = new Date(orderDates[j - 1]);
      prevDate.setDate(prevDate.getDate() - randInt(cohort.cycleDaysAvg - 7, cohort.cycleDaysAvg + 7));
      if (prevDate < daysAgo(DAYS_BACK)) break;
      orderDates.push(prevDate);
    }

    let ordersCreated = 0;
    for (const orderDate of orderDates.reverse()) {
      try {
        // Pick 1-3 products for this order
        const numLineItems = randInt(1, 3);
        const lineItems = [];
        const usedProducts = new Set<number>();
        for (let li = 0; li < numLineItems; li++) {
          let product;
          do {
            product = products[randInt(0, products.length - 1)];
          } while (usedProducts.has(product.id) && usedProducts.size < products.length);
          usedProducts.add(product.id);
          const variant = product.variants[0];
          lineItems.push({
            variant_id: variant.id,
            quantity: randInt(1, 2),
          });
        }

        // Some discount usage (40% of orders)
        const useDiscount = Math.random() < 0.4;

        await client.post("/orders.json", {
          order: {
            email: customer.email,
            customer: { id: customer.id },
            line_items: lineItems,
            financial_status: "paid",
            fulfillment_status: "fulfilled",
            processed_at: isoDate(orderDate),
            created_at: isoDate(orderDate),
            tags: `seed,cohort_${cohort.name}`,
            discount_codes: useDiscount
              ? [{ code: "SEED10", amount: "10.00", type: "percentage" }]
              : [],
            note: `Seed order — cohort: ${cohort.name}`,
          },
        });
        ordersCreated++;
        totalOrders++;
      } catch (err) {
        // Don't break on single order failure — log and continue
        // (Shopify is sometimes finicky with backdated orders)
      }
    }

    process.stdout.write(`  → ${ordersCreated} orders\n`);
  }

  console.log(`\n✅ Done`);
  console.log(`   Customers created: ${totalCustomers}`);
  console.log(`   Orders created:    ${totalOrders}`);
  console.log(`\n📊 Cohort distribution:`);
  for (const [name, count] of Object.entries(cohortCounts).sort()) {
    console.log(`   ${name.padEnd(20)} ${count}`);
  }
}

// ============================================================
// Type definitions for Shopify Admin API responses
// ============================================================
interface ShopifyVariant {
  id: number;
  product_id: number;
  title: string;
  price: string;
  sku: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  product_type: string;
  variants: ShopifyVariant[];
}

interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
