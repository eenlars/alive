/**
 * Unit Tests for User Quotas
 *
 * Tests the site creation limit enforcement logic
 */

import { LIMITS } from "@webalive/shared"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createServiceAppClient, createServiceIamClient } from "@/lib/supabase/service"
import { assertSupabaseServiceEnv } from "@/lib/test-helpers/integration-env"
import { countUserSites, getUserMaxSites, getUserQuota, getUserQuotaByEmail } from "../user-quotas"

const TEST_EMAIL = "test-user-quotas@example.com"
const TEST_EMAIL_NEW = "test-user-quotas-new@example.com"

assertSupabaseServiceEnv()

describe("User Quotas", () => {
  let testUserId: string
  let testOrgId: string
  let iam: ReturnType<typeof createServiceIamClient>
  let app: ReturnType<typeof createServiceAppClient>

  beforeEach(async () => {
    // Create clients directly for tests (bypasses Next.js cookies)
    iam = createServiceIamClient()
    app = createServiceAppClient()

    // Clean up any existing test data
    await cleanupTestUser(TEST_EMAIL, iam, app)
    await cleanupTestUser(TEST_EMAIL_NEW, iam, app)

    // Create fresh test user
    const { data: newUser, error: userError } = await iam
      .from("users")
      .insert({
        email: TEST_EMAIL,
        password_hash: "test-hash",
        status: "active",
        is_test_env: true,
        metadata: {},
      })
      .select("user_id")
      .single()

    if (userError || !newUser) {
      throw new Error(`Failed to create test user: ${userError?.message}`)
    }

    testUserId = newUser.user_id

    // Create an org for the user
    const { data: newOrg, error: orgError } = await iam
      .from("orgs")
      .insert({
        name: "Test Org",
        credits: 100,
        is_test_env: true,
      })
      .select("org_id")
      .single()

    if (orgError || !newOrg) {
      throw new Error(`Failed to create test org: ${orgError?.message}`)
    }

    testOrgId = newOrg.org_id

    // Create owner membership
    await iam.from("org_memberships").insert({
      org_id: testOrgId,
      user_id: testUserId,
      role: "owner",
    })
  })

  afterEach(async () => {
    // Clean up test data
    await cleanupTestUser(TEST_EMAIL, iam, app)
    await cleanupTestUser(TEST_EMAIL_NEW, iam, app)
  })

  describe("countUserSites", () => {
    test("returns 0 for user with no sites", async () => {
      const count = await countUserSites(testUserId, iam, app)
      expect(count).toBe(0)
    })

    test("counts sites across owned organizations", async () => {
      // Add a domain to the org
      await app.from("domains").insert({
        hostname: "test-quota-1.example.com",
        org_id: testOrgId,
        port: 3333,
        is_test_env: true,
      })

      const count = await countUserSites(testUserId, iam, app)
      expect(count).toBe(1)

      // Add another domain
      await app.from("domains").insert({
        hostname: "test-quota-2.example.com",
        org_id: testOrgId,
        port: 3334,
        is_test_env: true,
      })

      const count2 = await countUserSites(testUserId, iam, app)
      expect(count2).toBe(2)
    })

    test("does not count sites from orgs where user is not owner", async () => {
      // Create another org where user is just a member
      const { data: memberOrg } = await iam
        .from("orgs")
        .insert({ name: "Member Org", credits: 100, is_test_env: true })
        .select("org_id")
        .single()

      if (!memberOrg) throw new Error("Failed to create member org")

      await iam.from("org_memberships").insert({
        org_id: memberOrg.org_id,
        user_id: testUserId,
        role: "member", // Not owner!
      })

      // Add domain to member org
      await app.from("domains").insert({
        hostname: "test-member-site.example.com",
        org_id: memberOrg.org_id,
        port: 3335,
        is_test_env: true,
      })

      // Should not count the member org's site
      const count = await countUserSites(testUserId, iam, app)
      expect(count).toBe(0)

      // Cleanup
      await app.from("domains").delete().eq("org_id", memberOrg.org_id)
      await iam.from("org_memberships").delete().eq("org_id", memberOrg.org_id)
      await iam.from("orgs").delete().eq("org_id", memberOrg.org_id)
    })

    test("counts sites across multiple owned orgs", async () => {
      // Create a second org where user is owner
      const { data: secondOrg } = await iam
        .from("orgs")
        .insert({ name: "Second Org", credits: 100, is_test_env: true })
        .select("org_id")
        .single()

      if (!secondOrg) throw new Error("Failed to create second org")

      await iam.from("org_memberships").insert({
        org_id: secondOrg.org_id,
        user_id: testUserId,
        role: "owner",
      })

      // Add domains to both orgs
      await app.from("domains").insert([
        { hostname: "org1-site.example.com", org_id: testOrgId, port: 3336, is_test_env: true },
        { hostname: "org2-site.example.com", org_id: secondOrg.org_id, port: 3337, is_test_env: true },
      ])

      const count = await countUserSites(testUserId, iam, app)
      expect(count).toBe(2)

      // Cleanup
      await app.from("domains").delete().eq("org_id", secondOrg.org_id)
      await iam.from("org_memberships").delete().eq("org_id", secondOrg.org_id)
      await iam.from("orgs").delete().eq("org_id", secondOrg.org_id)
    })
  })

  describe("getUserMaxSites", () => {
    test("returns default limit when no quota record exists", async () => {
      const maxSites = await getUserMaxSites(testUserId, app)
      expect(maxSites).toBe(LIMITS.MAX_SITES_PER_USER)
    })

    test("returns custom limit from user_quotas table", async () => {
      // Insert custom quota
      await app.from("user_quotas").insert({
        user_id: testUserId,
        max_sites: 10,
      })

      const maxSites = await getUserMaxSites(testUserId, app)
      expect(maxSites).toBe(10)
    })
  })

  describe("getUserQuota", () => {
    test("allows creation when under limit", async () => {
      const quota = await getUserQuota(testUserId, iam, app)

      expect(quota.maxSites).toBe(LIMITS.MAX_SITES_PER_USER)
      expect(quota.currentSites).toBe(0)
      expect(quota.canCreateSite).toBe(true)
    })

    test("blocks creation when at limit", async () => {
      // Add sites up to the limit
      for (let i = 0; i < LIMITS.MAX_SITES_PER_USER; i++) {
        await app.from("domains").insert({
          hostname: `test-limit-${i}.example.com`,
          org_id: testOrgId,
          port: 3340 + i,
          is_test_env: true,
        })
      }

      const quota = await getUserQuota(testUserId, iam, app)

      expect(quota.maxSites).toBe(LIMITS.MAX_SITES_PER_USER)
      expect(quota.currentSites).toBe(LIMITS.MAX_SITES_PER_USER)
      expect(quota.canCreateSite).toBe(false)
    })

    test("respects custom quota from database", async () => {
      // Set custom quota of 5
      await app.from("user_quotas").insert({
        user_id: testUserId,
        max_sites: 5,
      })

      // Add 3 sites
      for (let i = 0; i < 3; i++) {
        await app.from("domains").insert({
          hostname: `test-custom-${i}.example.com`,
          org_id: testOrgId,
          port: 3350 + i,
          is_test_env: true,
        })
      }

      const quota = await getUserQuota(testUserId, iam, app)

      expect(quota.maxSites).toBe(5)
      expect(quota.currentSites).toBe(3)
      expect(quota.canCreateSite).toBe(true)
    })
  })

  describe("getUserQuotaByEmail", () => {
    test("returns null for non-existent user", async () => {
      const quota = await getUserQuotaByEmail(TEST_EMAIL_NEW, iam, app)
      expect(quota).toBeNull()
    })

    test("returns quota for existing user by email", async () => {
      const quota = await getUserQuotaByEmail(TEST_EMAIL, iam, app)

      expect(quota).not.toBeNull()
      expect(quota?.maxSites).toBe(LIMITS.MAX_SITES_PER_USER)
      expect(quota?.currentSites).toBe(0)
      expect(quota?.canCreateSite).toBe(true)
    })

    test("returns correct quota when user has sites", async () => {
      // Add a site
      await app.from("domains").insert({
        hostname: "test-email-lookup.example.com",
        org_id: testOrgId,
        port: 3360,
        is_test_env: true,
      })

      const quota = await getUserQuotaByEmail(TEST_EMAIL, iam, app)

      expect(quota).not.toBeNull()
      expect(quota?.currentSites).toBe(1)
    })
  })
})

/**
 * Helper to clean up test user and associated data
 */
async function cleanupTestUser(
  email: string,
  iam: ReturnType<typeof createServiceIamClient>,
  app: ReturnType<typeof createServiceAppClient>,
) {
  const { data: existingUsers } = await iam.from("users").select("user_id").eq("email", email)

  if (existingUsers && existingUsers.length > 0) {
    for (const user of existingUsers) {
      // Get org IDs for cleanup
      const { data: memberships } = await iam.from("org_memberships").select("org_id").eq("user_id", user.user_id)

      if (memberships) {
        for (const m of memberships) {
          // Delete domains in this org
          await app.from("domains").delete().eq("org_id", m.org_id)
          // Delete memberships
          await iam.from("org_memberships").delete().eq("org_id", m.org_id)
          // Delete org
          await iam.from("orgs").delete().eq("org_id", m.org_id)
        }
      }

      // Delete user_quotas
      await app.from("user_quotas").delete().eq("user_id", user.user_id)

      // Delete user
      await iam.from("users").delete().eq("user_id", user.user_id)
    }
  }
}
