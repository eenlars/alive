/**
 * Unit Tests for Organization Resolver
 *
 * Tests the core organization resolution logic for deployments
 */

import { createClient } from "@supabase/supabase-js"
import type { IamDatabase } from "@webalive/database"
import { beforeEach, describe, expect, test } from "vitest"
import { getSupabaseCredentials } from "@/lib/env/server"
import { assertSupabaseServiceEnv } from "@/lib/test-helpers/integration-env"
import { getUserDefaultOrgId, getUserOrganizations, validateUserOrgAccess } from "../org-resolver"

const TEST_EMAIL = "test-org-resolver@example.com"
const TEST_EMAIL_2 = "test-org-resolver-2@example.com"

assertSupabaseServiceEnv()

describe("Organization Resolver", () => {
  let testUserId: string
  let _testOrgId: string
  let iam: ReturnType<typeof createClient<IamDatabase>>

  beforeEach(async () => {
    // Create client directly for tests (bypasses Next.js cookies)
    const { url, key } = getSupabaseCredentials("service")
    iam = createClient<IamDatabase>(url, key, {
      db: { schema: "iam" },
    })

    // Clean up any existing test data
    const { data: existingUsers } = await iam.from("users").select("user_id").eq("email", TEST_EMAIL)

    if (existingUsers && existingUsers.length > 0) {
      for (const user of existingUsers) {
        // Get orgs to delete BEFORE deleting memberships
        const { data: orgs } = await iam
          .from("orgs")
          .select("org_id")
          .in(
            "org_id",
            (await iam.from("org_memberships").select("org_id").eq("user_id", user.user_id)).data?.map(m => m.org_id) ||
              [],
          )

        if (orgs) {
          for (const org of orgs) {
            await iam.from("org_memberships").delete().eq("org_id", org.org_id)
            await iam.from("orgs").delete().eq("org_id", org.org_id)
          }
        }

        // Delete user
        await iam.from("users").delete().eq("user_id", user.user_id)
      }
    }

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
  })

  describe("getUserDefaultOrgId", () => {
    test("creates new org for user with no organizations", async () => {
      // User has no orgs yet
      const orgs = await getUserOrganizations(testUserId, iam)
      expect(orgs).toHaveLength(0)

      // Get default org (should create one)
      const orgId = await getUserDefaultOrgId(testUserId, TEST_EMAIL, 200, iam)
      expect(orgId).toBeTruthy()
      expect(typeof orgId).toBe("string")

      // Verify org exists in database
      const { data: org } = await iam.from("orgs").select("*").eq("org_id", orgId).single()

      expect(org).toBeTruthy()
      expect(org?.name).toBe("test-org-resolver's organization")
      expect(org?.credits).toBe(200)

      // Verify membership exists
      const { data: membership } = await iam
        .from("org_memberships")
        .select("*")
        .eq("org_id", orgId)
        .eq("user_id", testUserId)
        .single()

      expect(membership).toBeTruthy()
      expect(membership?.role).toBe("owner")

      _testOrgId = orgId
    })

    test("reuses existing org for user with organization", async () => {
      // Create first org
      const orgId1 = await getUserDefaultOrgId(testUserId, TEST_EMAIL, 200, iam)

      // Call again - should return same org
      const orgId2 = await getUserDefaultOrgId(testUserId, TEST_EMAIL, 200, iam)

      expect(orgId1).toBe(orgId2)

      // Verify only ONE org exists for user
      const orgs = await getUserOrganizations(testUserId, iam)
      expect(orgs).toHaveLength(1)
    })

    test("returns first org if user has multiple orgs", async () => {
      // Manually create 2 orgs for user
      const { data: org1 } = await iam
        .from("orgs")
        .insert({ name: "Org 1", credits: 100, is_test_env: true })
        .select("org_id")
        .single()

      const { data: org2 } = await iam
        .from("orgs")
        .insert({ name: "Org 2", credits: 200, is_test_env: true })
        .select("org_id")
        .single()

      if (!org1 || !org2) throw new Error("Failed to create test orgs")

      // Create memberships (org1 created first)
      await iam.from("org_memberships").insert({
        org_id: org1.org_id,
        user_id: testUserId,
        role: "owner",
      })

      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 100))

      await iam.from("org_memberships").insert({
        org_id: org2.org_id,
        user_id: testUserId,
        role: "owner",
      })

      // Should return first org (by creation time)
      const defaultOrgId = await getUserDefaultOrgId(testUserId, TEST_EMAIL, 200, iam)
      expect(defaultOrgId).toBe(org1.org_id)
    })

    test("uses custom initial credits when creating org", async () => {
      const customCredits = 500
      const orgId = await getUserDefaultOrgId(testUserId, TEST_EMAIL, customCredits, iam)

      const { data: org } = await iam.from("orgs").select("credits").eq("org_id", orgId).single()

      expect(org?.credits).toBe(customCredits)
    })
  })

  describe("getUserOrganizations", () => {
    test("returns empty array for user with no orgs", async () => {
      const orgs = await getUserOrganizations(testUserId, iam)
      expect(orgs).toHaveLength(0)
    })

    test("returns user's organizations with metadata", async () => {
      // Create org
      const orgId = await getUserDefaultOrgId(testUserId, TEST_EMAIL, 250, iam)

      // Fetch orgs
      const orgs = await getUserOrganizations(testUserId, iam)

      expect(orgs).toHaveLength(1)
      expect(orgs[0]).toMatchObject({
        orgId: orgId,
        orgName: "test-org-resolver's organization",
        credits: 250,
        role: "owner",
      })
    })

    test("returns multiple orgs if user has them", async () => {
      // Create 2 orgs
      const { data: org1 } = await iam
        .from("orgs")
        .insert({ name: "Personal", credits: 100, is_test_env: true })
        .select("org_id")
        .single()

      const { data: org2 } = await iam
        .from("orgs")
        .insert({ name: "Work", credits: 200, is_test_env: true })
        .select("org_id")
        .single()

      if (!org1 || !org2) throw new Error("Failed to create orgs")

      // Create memberships
      await iam.from("org_memberships").insert([
        { org_id: org1.org_id, user_id: testUserId, role: "owner" },
        { org_id: org2.org_id, user_id: testUserId, role: "member" },
      ])

      // Fetch orgs
      const orgs = await getUserOrganizations(testUserId, iam)

      expect(orgs).toHaveLength(2)
      expect(orgs.find(o => o.orgName === "Personal")?.role).toBe("owner")
      expect(orgs.find(o => o.orgName === "Work")?.role).toBe("member")
    })
  })

  describe("validateUserOrgAccess", () => {
    test("returns true when user has access to org", async () => {
      // Create org for user
      const orgId = await getUserDefaultOrgId(testUserId, TEST_EMAIL, 200, iam)

      // Validate access
      const hasAccess = await validateUserOrgAccess(testUserId, orgId, iam)
      expect(hasAccess).toBe(true)
    })

    test("returns false when user does not have access to org", async () => {
      // Create org for different user
      // First check if user already exists
      let otherUserId: string
      const { data: existingOtherUser } = await iam.from("users").select("user_id").eq("email", TEST_EMAIL_2).single()

      if (existingOtherUser) {
        otherUserId = existingOtherUser.user_id
      } else {
        const { data: newOtherUser, error } = await iam
          .from("users")
          .insert({
            email: TEST_EMAIL_2,
            password_hash: "hash",
            status: "active",
            is_test_env: true,
            metadata: {},
          })
          .select("user_id")
          .single()

        if (error || !newOtherUser) {
          throw new Error(`Failed to create other user: ${error?.message}`)
        }
        otherUserId = newOtherUser.user_id
      }

      const otherOrgId = await getUserDefaultOrgId(otherUserId, TEST_EMAIL_2, 200, iam)

      // Test user should NOT have access to other user's org
      const hasAccess = await validateUserOrgAccess(testUserId, otherOrgId, iam)
      expect(hasAccess).toBe(false)

      // Cleanup
      await iam.from("org_memberships").delete().eq("user_id", otherUserId)
      await iam.from("orgs").delete().eq("org_id", otherOrgId)
      await iam.from("users").delete().eq("user_id", otherUserId)
    })

    test("returns false for non-existent org", async () => {
      const hasAccess = await validateUserOrgAccess(testUserId, "org_nonexistent", iam)
      expect(hasAccess).toBe(false)
    })
  })
})
