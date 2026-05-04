/**
 * Migration runner — applies all SQL files in supabase/migrations/ in order.
 *
 * Usage:
 *   npx tsx scripts/run-migrations.ts
 *
 * Tracks which migrations have been applied via a `migrations_log` table.
 * Idempotent: re-running skips already-applied migrations.
 */

import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { config } from "dotenv";

config({ path: ".env.local" });

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set in .env.local");
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  console.log("🔌 Connecting to database...");
  await client.connect();
  console.log("✅ Connected\n");

  // Ensure migrations log table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.migrations_log (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Get list of already-applied migrations
  const { rows: applied } = await client.query<{ filename: string }>(
    "SELECT filename FROM public.migrations_log ORDER BY filename"
  );
  const appliedSet = new Set(applied.map((r) => r.filename));

  // Find migration files
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log("⚠️  No migration files found in supabase/migrations/");
    await client.end();
    return;
  }

  let appliedCount = 0;
  let skippedCount = 0;

  for (const file of files) {
    const filename = basename(file);
    if (appliedSet.has(filename)) {
      console.log(`⏭️  ${filename} (already applied)`);
      skippedCount++;
      continue;
    }

    console.log(`▶️  Applying ${filename}...`);
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO public.migrations_log (filename) VALUES ($1)",
        [filename]
      );
      await client.query("COMMIT");
      console.log(`✅ ${filename}\n`);
      appliedCount++;
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`❌ Failed: ${filename}`);
      console.error(error);
      process.exit(1);
    }
  }

  console.log(`\n📊 Summary: ${appliedCount} applied, ${skippedCount} skipped`);
  await client.end();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
