/**
 * Supabase Password Management
 * Updates user passwords in iam.users table
 */

import * as Sentry from "@sentry/nextjs"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"
import { hashPassword } from "@/types/guards/api"

/**
 * Update user password by email
 * @param email - User's email address
 * @param newPassword - New plaintext password (will be hashed)
 * @returns true if successful
 */
export async function updateUserPasswordByEmail(email: string, newPassword: string): Promise<boolean> {
  try {
    const hashedPassword = await hashPassword(newPassword)
    const iam = await createIamClient("service")

    const { error } = await iam.from("users").update({ password_hash: hashedPassword }).eq("email", email)

    if (error) {
      console.error("[Supabase Passwords] Failed to update password for email:", email, error)
      Sentry.captureException(new Error(`[Supabase Passwords] Failed to update password: ${error.code ?? "unknown"}`))
      return false
    }

    console.log("[Supabase Passwords] Updated password for:", email)
    return true
  } catch (error) {
    console.error("[Supabase Passwords] Error updating password:", error)
    Sentry.captureException(error)
    return false
  }
}

/**
 * Update password for domain's organization owner
 * @param domain - Domain/hostname
 * @param newPassword - New plaintext password
 * @returns true if successful
 */
export async function updateDomainOwnerPassword(domain: string, newPassword: string): Promise<boolean> {
  try {
    // Step 1: Get org_id from domain
    const app = await createAppClient("service")
    const { data: domainData, error: domainError } = await app
      .from("domains")
      .select("org_id")
      .eq("hostname", domain)
      .single()

    if (domainError || !domainData || !domainData.org_id) {
      console.error("[Supabase Passwords] Domain not found or has no org:", domain, domainError)
      return false
    }

    // Step 2: Get org owner from memberships
    const iam = await createIamClient("service")
    const { data: ownerMembership, error: memberError } = await iam
      .from("org_memberships")
      .select("user_id")
      .eq("org_id", domainData.org_id)
      .eq("role", "owner")
      .single()

    if (memberError || !ownerMembership) {
      console.error("[Supabase Passwords] Org owner not found for:", domain, memberError)
      return false
    }

    // Step 3: Update owner's password
    const hashedPassword = await hashPassword(newPassword)
    const { error: updateError } = await iam
      .from("users")
      .update({ password_hash: hashedPassword })
      .eq("user_id", ownerMembership.user_id)

    if (updateError) {
      console.error("[Supabase Passwords] Failed to update owner password:", updateError)
      return false
    }

    console.log("[Supabase Passwords] Updated password for domain owner:", domain)
    return true
  } catch (error) {
    console.error("[Supabase Passwords] Error updating domain owner password:", error)
    Sentry.captureException(error)
    return false
  }
}

/**
 * Update user email in Supabase
 * @param oldEmail - Current email address
 * @param newEmail - New email address
 * @returns true if successful
 */
export async function updateUserEmail(oldEmail: string, newEmail: string): Promise<boolean> {
  try {
    const iam = await createIamClient("service")
    const { error } = await iam.from("users").update({ email: newEmail }).eq("email", oldEmail)

    if (error) {
      console.error("[Supabase Passwords] Failed to update email:", error)
      Sentry.captureException(new Error(`[Supabase Passwords] Failed to update email: ${error.code ?? "unknown"}`))
      return false
    }

    console.log("[Supabase Passwords] Updated email:", oldEmail, "→", newEmail)
    return true
  } catch (error) {
    console.error("[Supabase Passwords] Error updating email:", error)
    Sentry.captureException(error)
    return false
  }
}
