/**
 * Playwright Global Teardown - Cleanup Test Data
 *
 * Removes all test data for this run after tests complete.
 */

import { createClient } from "@supabase/supabase-js"
import type { AppDatabase, IamDatabase } from "@webalive/database"
import { getSupabaseCredentials } from "@/lib/env/server"

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error)
    return String((error as { message: unknown }).message)
  return JSON.stringify(error)
}

export default async function globalTeardown() {
  const runId = process.env.E2E_RUN_ID

  if (!runId) {
    console.warn("\n⚠️  [Global Teardown] No E2E_RUN_ID found, skipping cleanup\n")
    return
  }

  console.log(`\n🧹 [Global Teardown] Cleaning up test run: ${runId}`)

  const { url, key } = getSupabaseCredentials("service")

  const iam = createClient<IamDatabase>(url, key, { db: { schema: "iam" } })
  const app = createClient<AppDatabase>(url, key, { db: { schema: "app" } })

  // 1. Get test user IDs
  const { data: users } = await iam.from("users").select("user_id").eq("test_run_id", runId)
  const userIds = users?.map(u => u.user_id) || []

  // 2. Get test org IDs
  const { data: orgs } = await iam.from("orgs").select("org_id").eq("test_run_id", runId)
  const orgIds = orgs?.map(o => o.org_id) || []

  const stats = {
    sessions: 0,
    domains: 0,
    memberships: 0,
    orgs: 0,
    users: 0,
  }

  // 3. Delete sessions (must happen before users due to FK constraint)
  if (userIds.length > 0) {
    try {
      const { count, error } = await iam.from("sessions").delete({ count: "exact" }).in("user_id", userIds)
      if (error) throw error
      stats.sessions = count || 0
    } catch (error) {
      console.error(`⚠️  [Global Teardown] Failed to delete sessions for user_ids: ${userIds.join(", ")}`)
      console.error(`   Error: ${formatError(error)}`)
      stats.sessions = 0
    }
  }

  // 4. Delete domains
  if (orgIds.length > 0) {
    try {
      const { count, error } = await app.from("domains").delete({ count: "exact" }).in("org_id", orgIds)
      if (error) throw error
      stats.domains = count || 0
    } catch (error) {
      console.error(`⚠️  [Global Teardown] Failed to delete domains for org_ids: ${orgIds.join(", ")}`)
      console.error(`   Error: ${formatError(error)}`)
      stats.domains = 0
    }
  }

  // 5. Delete memberships
  if (userIds.length > 0) {
    try {
      const { count, error } = await iam.from("org_memberships").delete({ count: "exact" }).in("user_id", userIds)
      if (error) throw error
      stats.memberships = count || 0
    } catch (error) {
      console.error(`⚠️  [Global Teardown] Failed to delete org_memberships for user_ids: ${userIds.join(", ")}`)
      console.error(`   Error: ${formatError(error)}`)
      stats.memberships = 0
    }
  }

  // 6. Delete orgs
  if (orgIds.length > 0) {
    try {
      const { count, error } = await iam.from("orgs").delete({ count: "exact" }).in("org_id", orgIds)
      if (error) throw error
      stats.orgs = count || 0
    } catch (error) {
      console.error(`⚠️  [Global Teardown] Failed to delete orgs for org_ids: ${orgIds.join(", ")}`)
      console.error(`   Error: ${formatError(error)}`)
      stats.orgs = 0
    }
  }

  // 7. Delete users
  if (userIds.length > 0) {
    try {
      const { count, error } = await iam.from("users").delete({ count: "exact" }).in("user_id", userIds)
      if (error) throw error
      stats.users = count || 0
    } catch (error) {
      console.error(`⚠️  [Global Teardown] Failed to delete users for user_ids: ${userIds.join(", ")}`)
      console.error(`   Error: ${formatError(error)}`)
      stats.users = 0
    }
  }

  console.log(`✓ Sessions: ${stats.sessions}`)
  console.log(`✓ Domains: ${stats.domains}`)
  console.log(`✓ Memberships: ${stats.memberships}`)
  console.log(`✓ Orgs: ${stats.orgs}`)
  console.log(`✓ Users: ${stats.users}`)
  console.log("\n✅ [Global Teardown] Cleanup complete\n")
}
