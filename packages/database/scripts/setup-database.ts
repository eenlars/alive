#!/usr/bin/env bun
/**
 * Database Setup Script
 *
 * Sets up the Alive database from scratch.
 *
 * Usage:
 *   bun run db:setup               # Interactive setup
 *   bun run db:setup --apply       # Apply migration directly
 *
 * Requirements:
 *   - PostgreSQL 15+
 *   - DATABASE_URL environment variable
 */

import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

const scriptDir = dirname(new URL(import.meta.url).pathname)
const migrationPath = resolve(scriptDir, "../migrations/0001_init.sql")

async function main() {
  const args = process.argv.slice(2)
  const shouldApply = args.includes("--apply")

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║               Alive Database Setup                                ║
╚══════════════════════════════════════════════════════════════════╝
`)

  // Check migration file exists
  if (!existsSync(migrationPath)) {
    console.error("❌ Migration file not found:", migrationPath)
    process.exit(1)
  }
  console.log("✓ Migration file found")

  // Check DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.log(`
❌ DATABASE_URL is not set.

Set it in your environment:

  # For Supabase
  export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"

  # For local PostgreSQL
  export DATABASE_URL="postgresql://postgres:password@localhost:5432/alive"

Then run this script again.
`)
    process.exit(1)
  }
  console.log("✓ DATABASE_URL is set")

  // Test connection
  try {
    const { Pool } = await import("pg")
    const pool = new Pool({ connectionString: databaseUrl })
    const result = await pool.query("SELECT version()")
    console.log("✓ Connected to:", result.rows[0].version.split(",")[0])
    await pool.end()
  } catch (e: any) {
    console.error("❌ Connection failed:", e.message)
    process.exit(1)
  }

  if (shouldApply) {
    // Apply migration directly
    console.log("\nApplying migration...")
    try {
      const { Pool } = await import("pg")
      const pool = new Pool({ connectionString: databaseUrl })
      const sql = readFileSync(migrationPath, "utf-8")
      await pool.query(sql)
      await pool.end()
      console.log("✓ Migration applied successfully!")
      console.log("\n📋 Next step: Generate TypeScript types")
      console.log("   bun run gen:types")
    } catch (e: any) {
      console.error("❌ Migration failed:", e.message)
      process.exit(1)
    }
  } else {
    // Show instructions
    console.log(`
📋 To set up your database:

   Option 1: Use psql directly
   ──────────────────────────
   psql $DATABASE_URL < packages/database/migrations/0001_init.sql

   Option 2: Run this script with --apply
   ──────────────────────────────────────
   bun run db:setup --apply

📋 After setup, generate TypeScript types:

   export SUPABASE_PROJECT_ID=your_project_id
   bun run gen:types

Done! Your database will have all tables, functions, and indexes.
`)
  }
}

main().catch(e => {
  console.error("Setup failed:", e.message)
  process.exit(1)
})
