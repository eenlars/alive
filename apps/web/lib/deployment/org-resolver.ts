/**
 * Organization Resolution for Deployments
 *
 * Provides reusable helpers for resolving which organization to deploy to.
 * Used by both authenticated deploy flows (Flow 1: UI deploy, Flow 2: subdomain deploy)
 *
 * CRITICAL: All deploy operations MUST be authenticated and have a target organization.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { IamDatabase as Database } from "@webalive/database"
import { FREE_CREDITS } from "@webalive/shared"
import { createIamClient } from "@/lib/supabase/iam"

export interface UserOrganization {
  orgId: string
  orgName: string
  credits: number
  role: "owner" | "admin" | "member" | "viewer"
}

/**
 * Get all organizations for a user
 *
 * @param userId - User ID from iam.users
 * @param iamClient - Optional IAM client (for testing)
 * @returns Array of organizations with metadata
 */
export async function getUserOrganizations(
  userId: string,
  iamClient?: SupabaseClient<Database>,
): Promise<UserOrganization[]> {
  const iam = iamClient || (await createIamClient("service"))

  // Get user's org memberships
  const { data: memberships, error: membershipsError } = await iam
    .from("org_memberships")
    .select("org_id, role")
    .eq("user_id", userId)

  if (membershipsError || !memberships) {
    console.error("[Org Resolver] Failed to fetch memberships:", membershipsError)
    return []
  }

  if (memberships.length === 0) {
    return []
  }

  const orgIds = memberships.map((m: { org_id: string; role: string }) => m.org_id)

  // Get org details
  const { data: orgs, error: orgsError } = await iam.from("orgs").select("org_id, name, credits").in("org_id", orgIds)

  if (orgsError || !orgs) {
    console.error("[Org Resolver] Failed to fetch orgs:", orgsError)
    return []
  }

  // Combine membership + org data
  return memberships.map((m: { org_id: string; role: string }) => {
    const org = orgs.find((o: { org_id: string; name: string; credits: number }) => o.org_id === m.org_id)
    return {
      orgId: m.org_id,
      orgName: org?.name || "Unknown",
      credits: org?.credits || 0,
      role: m.role as "owner" | "admin" | "member" | "viewer",
    }
  })
}

/**
 * Get user's default organization ID (creates one if user has no orgs)
 *
 * BEHAVIOR:
 * - Returns first org where user is owner
 * - Creates new org if user has no organizations
 * - Reuses existing org for subsequent calls (idempotent)
 *
 * NAMING:
 * - New orgs named: "{username}'s organization"
 * - NOT per-domain (e.g., NOT "user's example.com")
 *
 * @param userId - User ID from iam.users
 * @param userEmail - User email (for org naming if creating new org)
 * @param initialCredits - Credits for new org (default: FREE_CREDITS)
 * @param iamClient - Optional IAM client (for testing)
 * @param isTestEnv - Whether this is a test org (default: false)
 * @returns Organization ID
 * @throws Error if database operations fail
 */
export async function getUserDefaultOrgId(
  userId: string,
  userEmail: string,
  initialCredits: number = FREE_CREDITS,
  iamClient?: SupabaseClient<Database>,
  isTestEnv: boolean = false,
): Promise<string> {
  const iam = iamClient || (await createIamClient("service"))

  // Step 1: Check if user already has an organization
  const { data: existingMemberships, error: membershipsError } = await iam
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("role", "owner")
    .order("created_at", { ascending: true }) // Get oldest first (most likely default)

  if (membershipsError) {
    console.error("[Org Resolver] Failed to fetch memberships:", membershipsError)
    throw new Error(`Failed to fetch user organizations: ${membershipsError.message}`)
  }

  if (existingMemberships && existingMemberships.length > 0) {
    // User has existing organization - reuse it
    const orgId = existingMemberships[0].org_id
    console.log(`[Org Resolver] Reusing existing organization ${orgId} for user ${userEmail}`)
    return orgId
  }

  // Step 2: User has no organization - create new one
  const orgName = `${userEmail.split("@")[0]}'s organization`
  const { data: newOrg, error: orgError } = await iam
    .from("orgs")
    .insert({
      name: orgName,
      credits: initialCredits,
      is_test_env: isTestEnv,
    })
    .select("org_id")
    .single()

  if (orgError || !newOrg) {
    console.error("[Org Resolver] Failed to create org:", orgError)
    throw new Error(`Failed to create organization: ${orgError?.message}`)
  }

  // Step 3: Create owner membership
  const { error: membershipError } = await iam.from("org_memberships").insert({
    org_id: newOrg.org_id,
    user_id: userId,
    role: "owner",
  })

  if (membershipError) {
    console.error("[Org Resolver] Failed to create membership:", membershipError)
    throw new Error(`Failed to create org membership: ${membershipError.message}`)
  }

  console.log(`[Org Resolver] Created new organization ${newOrg.org_id} for user ${userEmail}`)
  return newOrg.org_id
}

/**
 * Get the first organization ID for a user (simpler than getUserDefaultOrgId)
 *
 * Unlike getUserDefaultOrgId, this does NOT create an org if none exists.
 * Use this for read operations where creating an org doesn't make sense.
 *
 * @param userId - User ID from iam.users
 * @param iamClient - Optional IAM client (for testing)
 * @returns Organization ID or null if user has no orgs
 */
export async function getOrgIdForUser(userId: string, iamClient?: SupabaseClient<Database>): Promise<string | null> {
  const orgs = await getUserOrganizations(userId, iamClient)
  if (orgs.length === 0) {
    return null
  }
  // Prefer owner orgs, fall back to first available
  const ownerOrg = orgs.find(o => o.role === "owner")
  return ownerOrg?.orgId || orgs[0].orgId
}

/**
 * Validate that a user has access to an organization
 *
 * @param userId - User ID from iam.users
 * @param orgId - Organization ID to validate
 * @param iamClient - Optional IAM client (for testing)
 * @returns true if user is a member of the org
 */
export async function validateUserOrgAccess(
  userId: string,
  orgId: string,
  iamClient?: SupabaseClient<Database>,
): Promise<boolean> {
  const iam = iamClient || (await createIamClient("service"))

  const { data: membership, error } = await iam
    .from("org_memberships")
    .select("org_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .single()

  if (error || !membership) {
    return false
  }

  return true
}

/**
 * Get organization details by ID
 *
 * @param orgId - Organization ID
 * @param iamClient - Optional IAM client (for testing)
 * @returns Organization details or null if not found
 */
export async function getOrganizationById(
  orgId: string,
  iamClient?: SupabaseClient<Database>,
): Promise<{
  orgId: string
  name: string
  credits: number
} | null> {
  const iam = iamClient || (await createIamClient("service"))

  const { data: org, error } = await iam.from("orgs").select("org_id, name, credits").eq("org_id", orgId).single()

  if (error || !org) {
    return null
  }

  return {
    orgId: org.org_id,
    name: org.name,
    credits: org.credits || 0,
  }
}
