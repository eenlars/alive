#!/usr/bin/env bun

/**
 * Cleanup script for expired OAuth secrets
 *
 * Run periodically (e.g., via cron) to delete expired secrets from the database.
 * This is optional - test cleanup happens automatically via user deletion.
 *
 * Usage:
 *   bun run cleanup-expired-secrets.ts [--dry-run] [--verbose]
 *
 * Environment:
 *   STREAM_ENV - Environment to run in (local|dev|staging|prod)
 *   Defaults to 'dev' if not set
 */

import { parseArgs } from "node:util"
import { createClient } from "@supabase/supabase-js"
import type { LockboxDatabase } from "@webalive/database"

// Parse command line arguments
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "dry-run": {
      type: "boolean",
      default: false,
      description: "Show what would be deleted without actually deleting",
    },
    verbose: {
      type: "boolean",
      default: false,
      description: "Show detailed output",
    },
    help: {
      type: "boolean",
      default: false,
      description: "Show help message",
    },
  },
})

if (values.help) {
  console.log(`
OAuth Expired Secrets Cleanup Script

This script deletes expired secrets from lockbox.user_secrets based on the expires_at field.

Usage:
  bun run cleanup-expired-secrets.ts [options]

Options:
  --dry-run     Show what would be deleted without actually deleting
  --verbose     Show detailed output
  --help        Show this help message

Environment Variables:
  SUPABASE_URL              Supabase project URL (required)
  SUPABASE_SERVICE_KEY      Service role key for database access (required)
  STREAM_ENV                Environment (local|dev|staging|prod) - defaults to 'dev'

Examples:
  # Dry run to see what would be deleted
  bun run cleanup-expired-secrets.ts --dry-run --verbose

  # Actually delete expired secrets
  bun run cleanup-expired-secrets.ts

  # Run in production
  STREAM_ENV=prod bun run cleanup-expired-secrets.ts
`)
  process.exit(0)
}

const isDryRun = values["dry-run"]
const isVerbose = values.verbose
const environment = process.env.STREAM_ENV || "dev"

// Safety check - require explicit confirmation for production
if (environment === "prod" && !isDryRun) {
  if (process.env.CONFIRM_PROD_CLEANUP !== "yes") {
    console.error("❌ Production cleanup requires CONFIRM_PROD_CLEANUP=yes")
    console.error("   Run with --dry-run first to review what will be deleted")
    process.exit(1)
  }
}

// Validate environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing required environment variables:")
  if (!supabaseUrl) console.error("   - SUPABASE_URL")
  if (!supabaseServiceKey) console.error("   - SUPABASE_SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

// Create Supabase client
const supabase = createClient<LockboxDatabase>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  db: {
    schema: "lockbox",
  },
})

async function cleanupExpiredSecrets() {
  console.log("🧹 OAuth Expired Secrets Cleanup")
  console.log(`📍 Environment: ${environment}`)
  console.log(`🔍 Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`)
  console.log(`⏰ Current time: ${new Date().toISOString()}`)
  console.log("")

  try {
    // First, count and optionally list expired secrets
    const countQuery = supabase
      .from("user_secrets")
      .select("user_secret_id, user_id, instance_id, namespace, name, version, expires_at", { count: "exact" })
      .lt("expires_at", new Date().toISOString())
      .not("expires_at", "is", null)

    const { data: expiredSecrets, count, error: countError } = await countQuery

    if (countError) {
      throw new Error(`Failed to query expired secrets: ${countError.message}`)
    }

    if (!count || count === 0) {
      console.log("✅ No expired secrets found. Database is clean!")
      return
    }

    console.log(`📊 Found ${count} expired secrets`)

    if (isVerbose && expiredSecrets) {
      console.log("\nExpired secrets to be deleted:")
      console.log("─".repeat(80))

      for (const secret of expiredSecrets) {
        const expiryAge = Date.now() - new Date(secret.expires_at).getTime()
        const ageHours = Math.floor(expiryAge / (1000 * 60 * 60))
        const ageDays = Math.floor(ageHours / 24)

        console.log(`  ID: ${secret.user_secret_id}`)
        console.log(`  User: ${secret.user_id}`)
        console.log(`  Instance: ${secret.instance_id}`)
        console.log(`  Secret: ${secret.namespace}/${secret.name} (v${secret.version})`)
        console.log(`  Expired: ${secret.expires_at} (${ageDays}d ${ageHours % 24}h ago)`)
        console.log("─".repeat(80))
      }
    }

    if (isDryRun) {
      console.log("\n🔍 DRY RUN COMPLETE - No secrets were deleted")
      console.log(`   Would have deleted ${count} expired secrets`)
      return
    }

    // Perform the actual deletion
    console.log("\n🗑️  Deleting expired secrets...")

    const { error: deleteError, count: deletedCount } = await supabase
      .from("user_secrets")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString())
      .not("expires_at", "is", null)

    if (deleteError) {
      throw new Error(`Failed to delete expired secrets: ${deleteError.message}`)
    }

    console.log(`✅ Successfully deleted ${deletedCount} expired secrets`)

    // Log summary
    if (isVerbose) {
      // Get statistics on remaining secrets
      const { count: totalCount } = await supabase.from("user_secrets").select("*", { count: "exact", head: true })

      const { count: withTtlCount } = await supabase
        .from("user_secrets")
        .select("*", { count: "exact", head: true })
        .not("expires_at", "is", null)

      console.log("\n📈 Database Statistics:")
      console.log(`   Total secrets: ${totalCount}`)
      console.log(`   Secrets with TTL: ${withTtlCount}`)
      console.log(`   Secrets without TTL: ${totalCount! - withTtlCount!}`)
    }
  } catch (error) {
    console.error("❌ Cleanup failed:", error)
    process.exit(1)
  }
}

// Run the cleanup
cleanupExpiredSecrets()
  .then(() => {
    console.log("\n✨ Cleanup completed successfully")
    process.exit(0)
  })
  .catch(error => {
    console.error("❌ Unexpected error:", error)
    process.exit(1)
  })
