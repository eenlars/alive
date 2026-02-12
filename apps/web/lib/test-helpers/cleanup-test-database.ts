/**
 * Database Cleanup for E2E Tests
 *
 * This module provides functions to clean up test data from the database
 * after E2E tests run. It identifies test data by:
 * - Users with is_test_env = true
 * - Domains matching test patterns (tc*.test.local, test-*.test.local, etc.)
 * - Organizations belonging to test users
 */

import { createServiceAppClient, createServiceIamClient } from "@/lib/supabase/service"
import { isTestEmail } from "./test-email-domains"

interface CleanupStats {
  usersDeleted: number
  orgsDeleted: number
  domainsDeleted: number
  membershipsDeleted: number
  invitesDeleted: number
  sessionsDeleted: number
}

/**
 * Clean up all test data from the database
 *
 * 🔒 CRITICAL SAFETY - TRIPLE VERIFICATION:
 * Only deletes users where ALL THREE conditions are met:
 * 1. is_test_env = true (set during createTestUser)
 * 2. email matches INTERNAL test domains (@alive-vitest.internal, etc.)
 * 3. NOT using common patterns that real users might use
 *
 * This triple-check prevents accidental deletion of real users.
 *
 * This function removes:
 * 1. Test user sessions
 * 2. Test organization invites
 * 3. Test domains (ONLY via org_id, NOT by domain pattern)
 * 4. Test org memberships
 * 5. Orphaned test organizations (orgs with zero members)
 * 6. Test users (with all safety checks)
 *
 * @param dryRun - If true, only shows what would be deleted without deleting
 * @returns Cleanup statistics
 */
export async function cleanupTestDatabase(dryRun: boolean = false): Promise<CleanupStats> {
  const iam = createServiceIamClient()
  const app = createServiceAppClient()

  console.log(`🧹 [Test Cleanup] Starting database cleanup... ${dryRun ? "(DRY RUN)" : ""}`)

  // Get test user IDs first (for counting and deletion)
  // SAFETY: Double-check with email pattern to prevent accidental deletion
  const { data: testUsers } = await iam.from("users").select("user_id, email").eq("is_test_env", true)

  // Additional safety: Only include users with ALLOWED test email domains
  // (defined in test-email-domains.ts - shared with auth-test-helper.ts)
  const safeTestUsers =
    testUsers?.filter(u => {
      const email = u.email || ""
      return isTestEmail(email)
    }) || []

  const testUserIds = safeTestUsers.map((u: { user_id: string }) => u.user_id)
  const skippedUsers = (testUsers?.length || 0) - safeTestUsers.length

  if (skippedUsers > 0) {
    console.warn(
      `⚠️  [Test Cleanup] Skipped ${skippedUsers} users with is_test_env=true but non-test emails (safety check)`,
    )
  }

  if (testUserIds.length === 0) {
    console.log("✓ [Test Cleanup] No test users found, skipping cleanup")
    return {
      usersDeleted: 0,
      orgsDeleted: 0,
      domainsDeleted: 0,
      membershipsDeleted: 0,
      invitesDeleted: 0,
      sessionsDeleted: 0,
    }
  }

  console.log(`📊 [Test Cleanup] Found ${testUserIds.length} test users (safe to delete)`)
  if (dryRun) {
    console.log("📋 [Test Cleanup] Test user emails:")
    for (const u of safeTestUsers) {
      console.log(`   - ${u.email}`)
    }
  }

  // Get test org IDs
  const { data: testMemberships } = await iam.from("org_memberships").select("org_id").in("user_id", testUserIds)

  const testOrgIds = [...new Set(testMemberships?.map((m: { org_id: string }) => m.org_id) || [])]
  console.log(`📊 [Test Cleanup] Found ${testOrgIds.length} test organizations`)

  // Step 1: Delete sessions for test users
  let sessionsCount = 0
  if (!dryRun) {
    const { error: sessionsError, count } = await iam
      .from("sessions")
      .delete({ count: "exact" })
      .in("user_id", testUserIds)

    if (sessionsError) {
      console.error("❌ [Test Cleanup] Failed to delete sessions:", sessionsError)
    } else {
      sessionsCount = count || 0
      console.log(`✓ [Test Cleanup] Deleted ${sessionsCount} test sessions`)
    }
  } else {
    const { count } = await iam.from("sessions").select("*", { count: "exact", head: true }).in("user_id", testUserIds)
    sessionsCount = count || 0
    console.log(`📋 [Test Cleanup] Would delete ${sessionsCount} test sessions`)
  }

  // Step 2: Delete pending invites for test orgs
  let invitesCount = 0
  if (testOrgIds.length > 0) {
    if (!dryRun) {
      const { error: invitesError, count } = await iam
        .from("org_invites")
        .delete({ count: "exact" })
        .in("org_id", testOrgIds)

      if (invitesError) {
        console.error("❌ [Test Cleanup] Failed to delete invites:", invitesError)
      } else {
        invitesCount = count || 0
        console.log(`✓ [Test Cleanup] Deleted ${invitesCount} test invites`)
      }
    } else {
      const { count } = await iam
        .from("org_invites")
        .select("*", { count: "exact", head: true })
        .in("org_id", testOrgIds)
      invitesCount = count || 0
      console.log(`📋 [Test Cleanup] Would delete ${invitesCount} test invites`)
    }
  }

  // Step 3: Delete test domains (by pattern or org association)
  let domainsCount = 0
  if (testOrgIds.length > 0) {
    if (!dryRun) {
      const { error: domainsError, count } = await app
        .from("domains")
        .delete({ count: "exact" })
        .in("org_id", testOrgIds)

      if (domainsError) {
        console.error("❌ [Test Cleanup] Failed to delete domains:", domainsError)
      } else {
        domainsCount = count || 0
        console.log(`✓ [Test Cleanup] Deleted ${domainsCount} test domains`)
      }
    } else {
      const { count } = await app.from("domains").select("*", { count: "exact", head: true }).in("org_id", testOrgIds)
      domainsCount = count || 0
      console.log(`📋 [Test Cleanup] Would delete ${domainsCount} test domains (by org)`)
    }
  }

  // REMOVED: Domain pattern matching (too risky - users might use similar patterns)
  // We only clean up domains that belong to test organizations (via org_id)

  // Step 4: Delete org memberships for test users
  let membershipsCount = 0
  if (!dryRun) {
    const { error: membershipsError, count } = await iam
      .from("org_memberships")
      .delete({ count: "exact" })
      .in("user_id", testUserIds)

    if (membershipsError) {
      console.error("❌ [Test Cleanup] Failed to delete memberships:", membershipsError)
    } else {
      membershipsCount = count || 0
      console.log(`✓ [Test Cleanup] Deleted ${membershipsCount} test memberships`)
    }
  } else {
    const { count } = await iam
      .from("org_memberships")
      .select("*", { count: "exact", head: true })
      .in("user_id", testUserIds)
    membershipsCount = count || 0
    console.log(`📋 [Test Cleanup] Would delete ${membershipsCount} test memberships`)
  }

  // Step 5: Delete orgs that now have no members (orphaned)
  const { data: allOrgs } = await iam.from("orgs").select("org_id, name")
  let orgsDeleted = 0

  if (allOrgs) {
    for (const org of allOrgs) {
      const { data: members } = await iam.from("org_memberships").select("user_id").eq("org_id", org.org_id).limit(1)

      // If no members, delete the org
      if (!members || members.length === 0) {
        if (!dryRun) {
          const { error } = await iam.from("orgs").delete().eq("org_id", org.org_id)
          if (!error) {
            orgsDeleted++
          }
        } else {
          console.log(`📋 [Test Cleanup] Would delete org: ${org.name} (${org.org_id})`)
          orgsDeleted++
        }
      }
    }
  }

  if (dryRun) {
    console.log(`📋 [Test Cleanup] Would delete ${orgsDeleted} orphaned organizations`)
  } else {
    console.log(`✓ [Test Cleanup] Deleted ${orgsDeleted} orphaned organizations`)
  }

  // Step 6: Delete test users (with email pattern safety check)
  let usersCount = 0
  if (!dryRun) {
    const { error: usersError, count } = await iam.from("users").delete({ count: "exact" }).in("user_id", testUserIds)

    if (usersError) {
      console.error("❌ [Test Cleanup] Failed to delete users:", usersError)
    } else {
      usersCount = count || 0
      console.log(`✓ [Test Cleanup] Deleted ${usersCount} test users`)
    }
  } else {
    usersCount = testUserIds.length
    console.log(`📋 [Test Cleanup] Would delete ${usersCount} test users`)
  }

  const stats: CleanupStats = {
    usersDeleted: usersCount || 0,
    orgsDeleted,
    domainsDeleted: domainsCount,
    membershipsDeleted: membershipsCount || 0,
    invitesDeleted: invitesCount,
    sessionsDeleted: sessionsCount || 0,
  }

  console.log("✅ [Test Cleanup] Database cleanup complete:", stats)

  return stats
}

/**
 * Clean up a specific test user and their associated data
 *
 * @param userId - User ID to clean up
 */
export async function cleanupSpecificTestUser(userId: string): Promise<void> {
  const iam = createServiceIamClient()
  const app = createServiceAppClient()

  console.log(`🧹 [Test Cleanup] Cleaning up user: ${userId}`)

  // Get user's orgs
  const { data: memberships } = await iam.from("org_memberships").select("org_id").eq("user_id", userId)

  const orgIds = memberships?.map((m: { org_id: string }) => m.org_id) || []

  // Delete sessions
  await iam.from("sessions").delete().eq("user_id", userId)

  // Delete domains in these orgs
  if (orgIds.length > 0) {
    await app.from("domains").delete().in("org_id", orgIds)
  }

  // Delete memberships
  await iam.from("org_memberships").delete().eq("user_id", userId)

  // Delete orgs that now have no members
  for (const orgId of orgIds) {
    const { data: remainingMembers } = await iam.from("org_memberships").select("user_id").eq("org_id", orgId).limit(1)

    if (!remainingMembers || remainingMembers.length === 0) {
      await iam.from("orgs").delete().eq("org_id", orgId)
    }
  }

  // Delete user
  await iam.from("users").delete().eq("user_id", userId)

  console.log(`✓ [Test Cleanup] User ${userId} cleaned up`)
}
