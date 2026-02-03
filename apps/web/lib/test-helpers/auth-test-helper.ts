/**
 * Authentication Test Helpers
 *
 * Provides utilities for setting up authenticated test scenarios
 */

import { randomUUID } from "node:crypto"
import { createClient } from "@supabase/supabase-js"
import type { IamDatabase } from "@webalive/database"
import { TEST_CONFIG } from "@webalive/shared"
import { hash } from "bcrypt"
import jwt from "jsonwebtoken"
import { getUserDefaultOrgId } from "@/lib/deployment/org-resolver"
import { getSupabaseCredentials } from "@/lib/env/server"
import { generateTestEmail, validateTestEmail } from "./test-email-domains"

export interface TestUser {
  userId: string
  email: string
  orgId: string
  orgName: string
}

/**
 * Create a test user with organization for testing
 *
 * ⚠️ CRITICAL SECURITY: Email MUST use INTERNAL test domains ONLY ⚠️
 *
 * Allowed domains (NEVER use these for real users):
 * - @bridge-vitest.internal (for vitest tests)
 * - @bridge-playwright.internal (for E2E tests)
 * - @claude-bridge-test.local (for other tests)
 *
 * DO NOT use @test.com, @example.com, etc. - real users might use these!
 *
 * @param email - Test user email (default: auto-generated with @bridge-vitest.internal)
 * @param credits - Initial credits for org (default: TEST_CONFIG.DEFAULT_CREDITS)
 * @param password - Plain text password to hash and store (default: TEST_CONFIG.TEST_PASSWORD)
 * @returns Test user with userId and orgId
 * @throws Error if email doesn't use an allowed internal test domain
 */
export async function createTestUser(
  email?: string,
  credits: number = TEST_CONFIG.DEFAULT_CREDITS,
  password: string = TEST_CONFIG.TEST_PASSWORD,
): Promise<TestUser> {
  const testEmail = email || generateTestEmail()

  // ENFORCE: Email must use internal test domain (throws if invalid)
  validateTestEmail(testEmail)

  // Create client directly for tests (bypasses Next.js cookies)
  const { url, key } = getSupabaseCredentials("service")
  const iam = createClient<IamDatabase>(url, key, {
    db: { schema: "iam" },
  })

  // Check if user already exists
  const { data: existingUser } = await iam.from("users").select("user_id").eq("email", testEmail).single()

  let userId: string

  if (existingUser) {
    userId = existingUser.user_id
  } else {
    // Generate UUID and hash password
    const newUserId = randomUUID()
    const passwordHash = await hash(password, 10)

    // Create user
    const { data: newUser, error: userError } = await iam
      .from("users")
      .insert({
        user_id: newUserId,
        email: testEmail,
        password_hash: passwordHash,
        status: "active",
        is_test_env: true,
        metadata: {},
        email_verified: true, // Test users are always verified
      })
      .select("user_id")
      .single()

    if (userError || !newUser) {
      throw new Error(`Failed to create test user: ${userError?.message}`)
    }

    userId = newUser.user_id
  }

  // Get or create default organization (with is_test_env: true)
  const orgId = await getUserDefaultOrgId(userId, testEmail, credits, iam, true)

  // Get org name
  const { data: org } = await iam.from("orgs").select("name").eq("org_id", orgId).single()

  return {
    userId,
    email: testEmail,
    orgId,
    orgName: org?.name || "Test Organization",
  }
}

/**
 * Clean up test user and their organizations
 *
 * @param userId - User ID to delete
 */
export async function cleanupTestUser(userId: string): Promise<void> {
  // Create client directly for tests (bypasses Next.js cookies)
  const { url, key } = getSupabaseCredentials("service")
  const iam = createClient<IamDatabase>(url, key, {
    db: { schema: "iam" },
  })

  // Get user's orgs
  const { data: memberships } = await iam.from("org_memberships").select("org_id").eq("user_id", userId)

  // Delete memberships
  await iam.from("org_memberships").delete().eq("user_id", userId)

  // Delete orgs
  if (memberships) {
    // Create app client for domain deletion
    const app = createClient(url, key, {
      db: { schema: "app" },
    })

    for (const membership of memberships) {
      // Delete domains in this org first
      await app.from("domains").delete().eq("org_id", membership.org_id)

      // Delete org
      await iam.from("orgs").delete().eq("org_id", membership.org_id)
    }
  }

  // Delete user
  await iam.from("users").delete().eq("user_id", userId)
}

/**
 * Create a JWT session token for E2E tests
 *
 * Uses HS256 signing (same as production) with proper payload structure.
 * Matches the SessionPayload interface from features/auth/lib/jwt.ts
 *
 * @param testUser - Test user object from fixtures
 * @returns Signed JWT token
 */
export async function createTestSessionToken(testUser: TestUser): Promise<string> {
  const JWT_SECRET = process.env.JWT_SECRET || "INSECURE_DEV_SECRET_CHANGE_IN_PRODUCTION"

  const payload = {
    sub: testUser.userId, // Standard JWT claim (used by RLS policies)
    userId: testUser.userId, // Legacy claim (backward compatibility)
    email: testUser.email,
    name: testUser.orgName,
    workspaces: [], // Empty workspaces for test deployments
  }

  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" })
}
