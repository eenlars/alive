/**
 * User Quotas - Manages per-user site limits from app.user_quotas
 *
 * Counts sites owned by a user across all their organizations and enforces limits.
 * Uses app.user_quotas table for per-user customizable limits.
 *
 * Default limit: LIMITS.MAX_SITES_PER_USER (2 sites)
 * Override: Update app.user_quotas.max_sites for specific users
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import type { AppDatabase, IamDatabase } from "@webalive/database"
import { LIMITS } from "@webalive/shared"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"

export interface UserQuota {
  /** Maximum sites this user can create */
  maxSites: number
  /** Current number of sites owned by user */
  currentSites: number
  /** Whether user can create a new site */
  canCreateSite: boolean
}

/**
 * Count total sites owned by a user across all their organizations
 *
 * Only counts sites in organizations where user has "owner" role.
 * This prevents members from being blocked by sites in orgs they belong to.
 *
 * @param userId - User ID from iam.users
 * @param iamClient - Optional IAM client (for testing)
 * @param appClient - Optional App client (for testing)
 */
export async function countUserSites(
  userId: string,
  iamClient?: SupabaseClient<IamDatabase>,
  appClient?: SupabaseClient<AppDatabase>,
): Promise<number> {
  const iam = iamClient || (await createIamClient("service"))
  const app = appClient || (await createAppClient("service"))

  // Get all orgs where user is owner
  const { data: memberships, error: membershipsError } = await iam
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("role", "owner")

  if (membershipsError) {
    console.error("[User Quotas] Failed to fetch memberships:", membershipsError)
    throw new Error(`Failed to fetch user memberships: ${membershipsError.message}`)
  }

  if (!memberships || memberships.length === 0) {
    return 0
  }

  const orgIds = memberships.map(m => m.org_id)

  // Count domains across all owned orgs
  const { count, error: countError } = await app
    .from("domains")
    .select("*", { count: "exact", head: true })
    .in("org_id", orgIds)

  if (countError) {
    console.error("[User Quotas] Failed to count domains:", countError)
    throw new Error(`Failed to count user domains: ${countError.message}`)
  }

  return count ?? 0
}

/**
 * Get the max_sites limit for a user from app.user_quotas
 *
 * If no quota record exists, returns default LIMITS.MAX_SITES_PER_USER.
 * Does NOT create a record - quotas are only created when needed (e.g., for upgrades).
 *
 * @param userId - User ID from iam.users
 * @param appClient - Optional App client (for testing)
 */
export async function getUserMaxSites(userId: string, appClient?: SupabaseClient<AppDatabase>): Promise<number> {
  const app = appClient || (await createAppClient("service"))

  const { data: quota, error } = await app.from("user_quotas").select("max_sites").eq("user_id", userId).single()

  if (error) {
    // PGRST116 = no rows returned - this is expected for users without custom quotas
    if (error.code === "PGRST116") {
      return LIMITS.MAX_SITES_PER_USER
    }
    console.error("[User Quotas] Failed to fetch quota:", error)
    throw new Error(`Failed to fetch user quota: ${error.message}`)
  }

  return quota?.max_sites ?? LIMITS.MAX_SITES_PER_USER
}

/**
 * Check if user can create a new site
 *
 * @param userId - User ID from iam.users
 * @param iamClient - Optional IAM client (for testing)
 * @param appClient - Optional App client (for testing)
 * @returns Object with quota info and whether creation is allowed
 */
export async function getUserQuota(
  userId: string,
  iamClient?: SupabaseClient<IamDatabase>,
  appClient?: SupabaseClient<AppDatabase>,
): Promise<UserQuota> {
  // Run both queries in parallel
  const [currentSites, maxSites] = await Promise.all([
    countUserSites(userId, iamClient, appClient),
    getUserMaxSites(userId, appClient),
  ])

  return {
    maxSites,
    currentSites,
    canCreateSite: currentSites < maxSites,
  }
}

/**
 * Check if a user (by email) can create a new site
 *
 * Used for anonymous deployments where we only have an email.
 * Looks up user ID from email, then checks quota.
 *
 * @param email - User email address
 * @param iamClient - Optional IAM client (for testing)
 * @param appClient - Optional App client (for testing)
 * @returns Object with quota info, or null if user doesn't exist (new user can always create)
 */
export async function getUserQuotaByEmail(
  email: string,
  iamClient?: SupabaseClient<IamDatabase>,
  appClient?: SupabaseClient<AppDatabase>,
): Promise<UserQuota | null> {
  const iam = iamClient || (await createIamClient("service"))

  // Look up user by email
  const { data: user, error } = await iam.from("users").select("user_id").eq("email", email.toLowerCase()).single()

  if (error) {
    // PGRST116 = no rows returned - user doesn't exist yet
    if (error.code === "PGRST116") {
      return null // New user, no limit check needed
    }
    console.error("[User Quotas] Failed to fetch user by email:", error)
    throw new Error(`Failed to fetch user: ${error.message}`)
  }

  if (!user) {
    return null
  }

  return getUserQuota(user.user_id, iamClient, appClient)
}
