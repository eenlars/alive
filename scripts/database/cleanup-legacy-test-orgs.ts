#!/usr/bin/env bun
/**
 * ONE-TIME MIGRATION: Clean up legacy test organizations
 *
 * This script removes test orgs created with the OLD test email domains
 * (@test.com, @example.com, etc.) before we switched to strict internal domains.
 *
 * Safety: Only deletes users where:
 * - is_test_env = true AND
 * - email matches OLD test patterns (that we no longer allow)
 *
 * Usage:
 *   bun scripts/cleanup-legacy-test-orgs.ts           # Dry run
 *   bun scripts/cleanup-legacy-test-orgs.ts --force   # Actually delete
 */

import { createClient } from "@supabase/supabase-js"
import { getSupabaseCredentials } from "../apps/web/lib/env/server"
import type { IamDatabase } from "@webalive/database"
import type { AppDatabase } from "@webalive/database"

// OLD test domains that we no longer allow (too generic, users might use them)
const LEGACY_TEST_DOMAINS = ["@test.com", "@example.com", "@localhost", "@test.local"]

async function cleanupLegacyTestOrgs(dryRun: boolean = true) {
  const { url, key } = getSupabaseCredentials("service")

  const iam = createClient<IamDatabase>(url, key, { db: { schema: "iam" } })
  const app = createClient<AppDatabase>(url, key, { db: { schema: "app" } })

  console.log(`🧹 [Legacy Cleanup] Starting cleanup... ${dryRun ? "(DRY RUN)" : "(FORCE)"}`)
  console.log()

  // Get all users with is_test_env = true
  const { data: testUsers } = await iam.from("users").select("user_id, email").eq("is_test_env", true)

  // Filter to only legacy test domains
  const legacyUsers =
    testUsers?.filter(u => {
      const email = u.email || ""
      return LEGACY_TEST_DOMAINS.some(domain => email.endsWith(domain))
    }) || []

  console.log(`📊 Found ${legacyUsers.length} legacy test users (old domains)`)

  if (legacyUsers.length === 0) {
    console.log("✅ No legacy test users to clean up!")
    return { users: 0, orgs: 0, domains: 0 }
  }

  console.log("\nLegacy test users:")
  for (const u of legacyUsers) {
    console.log(`  - ${u.email}`)
  }
  console.log()

  const userIds = legacyUsers.map(u => u.user_id)

  // Get orgs for these users
  const { data: memberships } = await iam.from("org_memberships").select("org_id").in("user_id", userIds)
  const orgIds = [...new Set(memberships?.map(m => m.org_id) || [])]

  console.log(`📊 Found ${orgIds.length} organizations to clean up`)

  if (dryRun) {
    console.log("\n⚠️  DRY RUN - No data will be deleted")
    console.log(`Would delete:`)
    console.log(`  - ${legacyUsers.length} test users`)
    console.log(`  - ${orgIds.length} test organizations`)
    console.log(`\nTo actually delete, run: bun scripts/cleanup-legacy-test-orgs.ts --force`)
    return { users: legacyUsers.length, orgs: orgIds.length, domains: 0 }
  }

  // Actually delete
  console.log("\n🗑️  Deleting legacy test data...")

  // 1. Delete sessions
  await iam.from("sessions").delete().in("user_id", userIds)
  console.log("✓ Deleted sessions")

  // 2. Delete domains
  if (orgIds.length > 0) {
    const { count } = await app.from("domains").delete({ count: "exact" }).in("org_id", orgIds)
    console.log(`✓ Deleted ${count || 0} domains`)
  }

  // 3. Delete invites
  if (orgIds.length > 0) {
    await iam.from("org_invites").delete().in("org_id", orgIds)
    console.log("✓ Deleted invites")
  }

  // 4. Delete memberships
  await iam.from("org_memberships").delete().in("user_id", userIds)
  console.log("✓ Deleted memberships")

  // 5. Delete orgs
  if (orgIds.length > 0) {
    await iam.from("orgs").delete().in("org_id", orgIds)
    console.log(`✓ Deleted ${orgIds.length} organizations`)
  }

  // 6. Delete users
  await iam.from("users").delete().in("user_id", userIds)
  console.log(`✓ Deleted ${legacyUsers.length} users`)

  console.log("\n✅ Legacy cleanup complete!")
  return { users: legacyUsers.length, orgs: orgIds.length, domains: 0 }
}

const args = process.argv.slice(2)
const forceDelete = args.includes("--force")

cleanupLegacyTestOrgs(!forceDelete)
  .then(stats => {
    console.log("\n" + "=".repeat(50))
    console.log("Summary:")
    console.log(`  • Users: ${stats.users}`)
    console.log(`  • Organizations: ${stats.orgs}`)
    process.exit(0)
  })
  .catch(error => {
    console.error("\n❌ Cleanup failed:", error)
    process.exit(1)
  })
