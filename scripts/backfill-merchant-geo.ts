/**
 * Backfill merchant geo columns (v1.5 Phase 1).
 *
 * Iterates every merchant where country_code IS NULL, decrypts their
 * Shopify access token, fetches /shop.json, and writes country_code +
 * country_name back to the row. Also fills store_currency / store_timezone
 * if they are NULL (older installs sometimes missed these).
 *
 * Idempotent — safe to re-run. Skips merchants without a token.
 *
 * Usage:
 *   npx tsx scripts/backfill-merchant-geo.ts
 *   npx tsx scripts/backfill-merchant-geo.ts --dry-run
 */

import { Client } from "pg";
import { config } from "dotenv";
import { decryptToken, fetchShopMetadata } from "../lib/shopify/oauth";

config({ path: ".env.local" });

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const pg = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  try {
    const { rows } = await pg.query<{
      id: string;
      shop_domain: string;
      access_token_encrypted: string | null;
      store_currency: string | null;
      store_timezone: string | null;
    }>(
      `SELECT id, shop_domain, access_token_encrypted, store_currency, store_timezone
       FROM public.merchants
       WHERE country_code IS NULL
         AND status = 'active'`
    );

    console.log(`Found ${rows.length} merchant(s) needing geo backfill\n`);
    if (rows.length === 0) return;

    let ok = 0;
    let skipped = 0;
    let failed = 0;

    for (const m of rows) {
      if (!m.access_token_encrypted) {
        console.warn(`  ⏭️  ${m.shop_domain} — no access token, skipping`);
        skipped++;
        continue;
      }
      try {
        const token = decryptToken(m.access_token_encrypted);
        const shopMeta = await fetchShopMetadata(m.shop_domain, token);
        if (dryRun) {
          console.log(
            `  [dry] ${m.shop_domain} → ${shopMeta.country_code} ${shopMeta.country_name}` +
              ` · ${shopMeta.currency} · ${shopMeta.iana_timezone}`
          );
        } else {
          await pg.query(
            `UPDATE public.merchants
             SET country_code  = $2,
                 country_name  = $3,
                 store_currency = COALESCE(store_currency, $4),
                 store_timezone = COALESCE(store_timezone, $5),
                 updated_at = NOW()
             WHERE id = $1`,
            [
              m.id,
              shopMeta.country_code,
              shopMeta.country_name,
              shopMeta.currency,
              shopMeta.iana_timezone,
            ]
          );
          console.log(`  ✅ ${m.shop_domain} → ${shopMeta.country_code} ${shopMeta.country_name}`);
        }
        ok++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ❌ ${m.shop_domain} — ${msg}`);
        failed++;
      }
    }

    console.log(`\n${dryRun ? "[dry-run] " : ""}Done — ${ok} ok · ${skipped} skipped · ${failed} failed`);
  } finally {
    await pg.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
