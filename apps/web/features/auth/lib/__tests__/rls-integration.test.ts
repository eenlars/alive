/**
 * RLS Integration Tests
 *
 * Tests the ACTUAL security implementation:
 * - Cross-org access prevention
 * - Admin vs member permissions
 * - Service role bypass
 * - JWT → Supabase RLS enforcement
 *
 * These tests hit the real Supabase database and verify RLS policies work.
 */

import { afterAll, beforeAll, describe, expect, it as test } from "vitest"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"
import { createSessionToken, type SessionOrgRole } from "../jwt"

// Test data
let testOrg1Id: string
let testOrg2Id: string
let testUser1Id: string // Member of Org 1
let testUser2Id: string // Member of Org 2
let testDomain1Id: string // Belongs to Org 1
let testDomain2Id: string // Belongs to Org 2

// Test JWT data
const TEST_EMAIL = "rls-test@example.com"
const TEST_NAME = "RLS Test User"
async function createRlsToken(userId: string, orgId: string, role: SessionOrgRole): Promise<string> {
  return createSessionToken({
    userId,
    email: TEST_EMAIL,
    name: TEST_NAME,
    orgIds: [orgId],
    orgRoles: { [orgId]: role },
  })
}

// TODO: Fix RLS test to work without special database permissions
describe.skip("RLS Integration - Cross-Org Access Prevention", () => {
  beforeAll(async () => {
    // Setup: Create test orgs, users, and domains
    const iam = await createIamClient("service")
    const app = await createAppClient("service")

    // Create test organizations
    const { data: org1, error: org1Error } = await iam
      .from("orgs")
      .insert({ name: "RLS Test Org 1", credits: 100 })
      .select("org_id")
      .single()

    const { data: org2, error: org2Error } = await iam
      .from("orgs")
      .insert({ name: "RLS Test Org 2", credits: 100 })
      .select("org_id")
      .single()

    if (!org1 || org1Error) {
      throw new Error(`Failed to create test org 1: ${org1Error?.message}`)
    }
    if (!org2 || org2Error) {
      throw new Error(`Failed to create test org 2: ${org2Error?.message}`)
    }

    testOrg1Id = org1.org_id
    testOrg2Id = org2.org_id

    // Create test users with unique emails to avoid conflicts
    const timestamp = Date.now()
    const { data: user1 } = await iam
      .from("users")
      .insert({ email: `rls-test-user-1-${timestamp}@example.com`, status: "active" })
      .select("user_id")
      .single()

    const { data: user2 } = await iam
      .from("users")
      .insert({ email: `rls-test-user-2-${timestamp}@example.com`, status: "active" })
      .select("user_id")
      .single()

    testUser1Id = user1!.user_id
    testUser2Id = user2!.user_id

    // Add users to their respective orgs
    await iam.from("org_memberships").insert([
      { user_id: testUser1Id, org_id: testOrg1Id, role: "member" },
      { user_id: testUser2Id, org_id: testOrg2Id, role: "owner" },
    ])

    // Create test domains
    const { data: domain1 } = await app
      .from("domains")
      .insert({ hostname: "rls-test-1.com", port: 3000, org_id: testOrg1Id })
      .select("domain_id")
      .single()

    const { data: domain2 } = await app
      .from("domains")
      .insert({ hostname: "rls-test-2.com", port: 3001, org_id: testOrg2Id })
      .select("domain_id")
      .single()

    testDomain1Id = domain1!.domain_id
    testDomain2Id = domain2!.domain_id
  })

  afterAll(async () => {
    // Cleanup: Delete test data
    const iam = await createIamClient("service")
    const app = await createAppClient("service")

    await app.from("domains").delete().in("domain_id", [testDomain1Id, testDomain2Id])
    await iam.from("org_memberships").delete().in("user_id", [testUser1Id, testUser2Id])
    await iam.from("orgs").delete().in("org_id", [testOrg1Id, testOrg2Id])
    await iam.from("users").delete().in("user_id", [testUser1Id, testUser2Id])
  })

  test("User 1 can see their own org's domain", async () => {
    // Create JWT for User 1
    const token = await createRlsToken(testUser1Id, testOrg1Id, "member")

    // Simulate createRLSClient behavior
    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    // Query domains (should only see Org 1's domain)
    const { data: domains, error } = await supabase.schema("app").from("domains").select("*")

    expect(error).toBeNull()
    expect(domains).toBeTruthy()
    expect(domains?.length).toBe(1)
    expect(domains?.[0].domain_id).toBe(testDomain1Id)
    expect(domains?.[0].hostname).toBe("rls-test-1.com")
  })

  test("User 1 CANNOT see User 2's org domain", async () => {
    const token = await createRlsToken(testUser1Id, testOrg1Id, "member")

    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    // Try to query Org 2's domain specifically
    const { data: domain, error } = await supabase
      .schema("app")
      .from("domains")
      .select("*")
      .eq("domain_id", testDomain2Id)
      .single()

    // Should not return the domain (RLS blocks it)
    expect(domain).toBeNull()
    expect(error).toBeTruthy() // PostgREST returns error for no rows
  })

  test("User 2 can see their own org's domain", async () => {
    const token = await createRlsToken(testUser2Id, testOrg2Id, "owner")

    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    const { data: domains, error } = await supabase.schema("app").from("domains").select("*")

    expect(error).toBeNull()
    expect(domains).toBeTruthy()
    expect(domains?.length).toBe(1)
    expect(domains?.[0].domain_id).toBe(testDomain2Id)
    expect(domains?.[0].hostname).toBe("rls-test-2.com")
  })

  test("Service role bypasses RLS and sees all domains", async () => {
    const app = await createAppClient("service")

    const { data: domains, error } = await app
      .from("domains")
      .select("*")
      .in("domain_id", [testDomain1Id, testDomain2Id])

    expect(error).toBeNull()
    expect(domains).toBeTruthy()
    expect(domains?.length).toBe(2) // Sees both domains
  })

  test("Unauthenticated request sees no domains", async () => {
    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")

    // No Authorization header = no JWT
    const supabase = createClient(url, key)

    const { data: domains } = await supabase.schema("app").from("domains").select("*")

    // Should return empty array (no access)
    expect(domains).toEqual([])
  })

  test("User 1 cannot update User 2's domain (cross-org write prevention)", async () => {
    const token = await createRlsToken(testUser1Id, testOrg1Id, "member")

    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    // Try to update Org 2's domain
    const { data, error } = await supabase
      .schema("app")
      .from("domains")
      .update({ hostname: "hacked.com" })
      .eq("domain_id", testDomain2Id)
      .select()

    // Should fail (RLS blocks update)
    expect(data).toEqual([]) // No rows updated
    expect(error).toBeTruthy()
  })

  test("Member cannot update domain (read-only access)", async () => {
    // User 1 is a member (not owner/admin) of Org 1
    const token = await createRlsToken(testUser1Id, testOrg1Id, "member")

    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    // Try to update own org's domain
    const { data, error } = await supabase
      .schema("app")
      .from("domains")
      .update({ hostname: "updated.com" })
      .eq("domain_id", testDomain1Id)
      .select()

    // Should fail (members can only read, not write)
    expect(data).toEqual([])
    expect(error).toBeTruthy()
  })

  test("Owner can update their org's domain", async () => {
    // User 2 is owner of Org 2
    const token = await createRlsToken(testUser2Id, testOrg2Id, "owner")

    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })

    const { data, error } = await supabase
      .schema("app")
      .from("domains")
      .update({ hostname: "updated-by-owner.com" })
      .eq("domain_id", testDomain2Id)
      .select()

    // Should succeed
    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data?.length).toBe(1)
    expect(data?.[0].hostname).toBe("updated-by-owner.com")

    // Revert for cleanup
    await supabase.schema("app").from("domains").update({ hostname: "rls-test-2.com" }).eq("domain_id", testDomain2Id)
  })

  test("Invalid JWT returns no domains", async () => {
    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: "Bearer invalid.jwt.token",
        },
      },
    })

    const { data: domains } = await supabase.schema("app").from("domains").select("*")

    // Should return empty (JWT verification fails)
    expect(domains).toEqual([])
  })

  test("Tampered JWT returns no domains", async () => {
    const token = await createRlsToken(testUser1Id, testOrg1Id, "member")

    // Tamper with token
    const parts = token.split(".")
    const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2]}TAMPERED`

    const { url, key } = await import("@/lib/env/server").then(m => m.getSupabaseCredentials("anon"))
    const { createClient } = await import("@supabase/supabase-js")
    const supabase = createClient(url, key, {
      global: {
        headers: {
          Authorization: `Bearer ${tamperedToken}`,
        },
      },
    })

    const { data: domains } = await supabase.schema("app").from("domains").select("*")

    // Should return empty (signature verification fails)
    expect(domains).toEqual([])
  })
})
