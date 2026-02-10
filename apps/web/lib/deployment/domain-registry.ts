/**
 * Domain Registry - Unified domain management for Supabase
 *
 * Handles registration/unregistration of domains across:
 * - Users (iam.users)
 * - Organizations (iam.orgs)
 * - Memberships (iam.org_memberships)
 * - Domains (app.domains)
 */

import { createClient } from "@supabase/supabase-js"
import type { AppDatabase, IamDatabase } from "@webalive/database"
import { getServerId } from "@webalive/shared"
import { getUserDefaultOrgId } from "@/lib/deployment/org-resolver"
import { type ErrorCode, ErrorCodes } from "@/lib/error-codes"
import { verifyPassword } from "@/types/guards/api"

/** Full domain information including infrastructure and ownership */
export interface DomainInfo {
  hostname: string
  port: number
  credits: number
  orgId: string
  orgName: string
  ownerEmail: string
  createdAt: string
}

/** Configuration for registering a new domain */
export interface DomainRegistration {
  hostname: string
  email: string
  password?: string // Optional: plain password for new account creation or existing account login
  port: number
  orgId?: string // Optional: Organization ID to deploy to. If not provided, uses user's default org
  credits?: number // Deprecated: Credits are now managed per-org, not per-domain
}

/**
 * Get Supabase credentials from environment
 * Works in both Next.js and standalone script contexts
 */
function getSupabaseCredentials() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment.")
  }

  return { url, key }
}

/**
 * Create IAM schema client
 * Uses direct credentials for compatibility with standalone scripts
 */
async function getIamClient() {
  const { url, key } = getSupabaseCredentials()
  return createClient<IamDatabase>(url, key, {
    db: { schema: "iam" },
  })
}

/**
 * Create App schema client
 * Uses direct credentials for compatibility with standalone scripts
 */
async function getAppClient() {
  const { url, key } = getSupabaseCredentials()
  return createClient<AppDatabase>(url, key, {
    db: { schema: "app" },
  })
}

/**
 * Get all domains with full information
 * Joins domains → orgs → users to get complete picture
 * @param includeTestData - If true, includes test domains (default: false)
 * @param thisServerOnly - If true, only returns domains for this server (default: true)
 */
export async function getAllDomains(includeTestData = false, thisServerOnly = true): Promise<DomainInfo[]> {
  const app = await getAppClient()
  const iam = await getIamClient()

  // Get all domains with org IDs (excluding test domains by default)
  let query = app.from("domains").select("hostname, port, org_id, created_at, server_id")
  if (!includeTestData) {
    query = query.eq("is_test_env", false)
  }

  // Filter by current server if requested
  if (thisServerOnly) {
    const serverId = getServerId()
    if (serverId) {
      query = query.eq("server_id", serverId)
    }
  }

  const { data: domains, error: domainsError } = await query

  if (domainsError || !domains) {
    console.error("[Domain Registry] Failed to fetch domains:", domainsError)
    return []
  }

  // Get all orgs (excluding test orgs by default)
  let orgsQuery = iam.from("orgs").select("org_id, name, credits")
  if (!includeTestData) {
    orgsQuery = orgsQuery.eq("is_test_env", false)
  }
  const { data: orgs, error: orgsError } = await orgsQuery

  if (orgsError || !orgs) {
    console.error("[Domain Registry] Failed to fetch orgs:", orgsError)
    return []
  }

  // Get all owner memberships
  const { data: memberships, error: membershipsError } = await iam
    .from("org_memberships")
    .select("org_id, user_id")
    .eq("role", "owner")

  if (membershipsError || !memberships) {
    console.error("[Domain Registry] Failed to fetch memberships:", membershipsError)
    return []
  }

  // Get all users
  const { data: users, error: usersError } = await iam.from("users").select("user_id, email")

  if (usersError || !users) {
    console.error("[Domain Registry] Failed to fetch users:", usersError)
    return []
  }

  // Build lookup maps
  const orgMap = new Map(orgs.map(o => [o.org_id, { name: o.name, credits: o.credits ?? 0 }]))
  const ownerMap = new Map(memberships.map(m => [m.org_id, m.user_id]))
  const userMap = new Map(users.map(u => [u.user_id, u.email]))

  // Combine all data
  return domains.map(d => {
    const orgId = d.org_id
    return {
      hostname: d.hostname,
      port: d.port,
      credits: orgId ? (orgMap.get(orgId)?.credits ?? 0) : 0,
      orgId: orgId ?? "",
      orgName: orgId ? (orgMap.get(orgId)?.name ?? "Unknown") : "Unknown",
      ownerEmail: orgId ? (userMap.get(ownerMap.get(orgId) ?? "") ?? "unknown@example.com") : "unknown@example.com",
      createdAt: d.created_at ?? new Date().toISOString(),
    }
  })
}

/**
 * Custom error for domain registration failures
 * Includes error code for proper error handling in API routes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class DomainRegistrationError extends Error {
  readonly errorCode: ErrorCode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly details: Record<string, any>

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(errorCode: ErrorCode, message: string, details: Record<string, any> = {}) {
    super(message)
    this.name = "DomainRegistrationError"
    this.errorCode = errorCode
    this.details = details
  }
}

/**
 * Get or create a user, optionally validating their password
 * Handles three cases: existing user with password, existing user without, new user creation
 */
async function getOrCreateUserId(email: string, password?: string): Promise<string> {
  const iam = await getIamClient()
  const { data: existingUser, error: userQueryError } = await iam
    .from("users")
    .select("user_id, password_hash")
    .eq("email", email)
    .single()

  if (existingUser) {
    // User exists - validate password if provided
    if (password && existingUser.password_hash) {
      const isPasswordValid = await verifyPassword(password, existingUser.password_hash)
      if (!isPasswordValid) {
        throw new DomainRegistrationError(
          ErrorCodes.INVALID_CREDENTIALS,
          `The password for email "${email}" is incorrect. Please check your password and try again.`,
          { email },
        )
      }
    }
    return existingUser.user_id
  }

  // User doesn't exist - try to create
  if (userQueryError?.code === "PGRST116") {
    if (!password) {
      throw new DomainRegistrationError(
        ErrorCodes.DEPLOYMENT_FAILED,
        `Cannot deploy with email "${email}" - account creation requires a password`,
        { email },
      )
    }

    const { hashPassword } = await import("@/types/guards/api")
    const passwordHash = await hashPassword(password)

    const { data: newUser, error: userError } = await iam
      .from("users")
      .insert({
        email,
        password_hash: passwordHash,
        status: "active",
        is_test_env: false,
        metadata: {},
        email_verified: true, // Enable referral rewards immediately (MVP: skip email verification)
      })
      .select("user_id")
      .single()

    if (userError || !newUser) {
      if (userError?.code === "23505" || userError?.message?.includes("duplicate")) {
        throw new DomainRegistrationError(
          ErrorCodes.EMAIL_ALREADY_REGISTERED,
          `Email "${email}" is already registered. Please use a different email or login with your existing account.`,
          { email },
        )
      }
      throw new DomainRegistrationError(
        ErrorCodes.DEPLOYMENT_FAILED,
        `Failed to create account for "${email}": ${userError?.message || "Unknown error"}`,
        { email },
      )
    }
    return newUser.user_id
  }

  // Unexpected database error during user lookup
  throw new DomainRegistrationError(
    ErrorCodes.DEPLOYMENT_FAILED,
    `Error checking user account: ${userQueryError?.message || "Unknown error"}`,
    { email },
  )
}

/**
 * Validate that a specific organization exists
 */
async function validateProvidedOrgId(orgId: string): Promise<void> {
  const iam = await getIamClient()
  const { data: orgExists, error: orgCheckError } = await iam.from("orgs").select("org_id").eq("org_id", orgId).single()

  if (orgCheckError?.code === "PGRST116") {
    throw new DomainRegistrationError(ErrorCodes.ORG_NOT_FOUND, `Organization "${orgId}" not found`, { orgId })
  }

  if (orgCheckError) {
    throw new DomainRegistrationError(
      ErrorCodes.DEPLOYMENT_FAILED,
      `Failed to check organization: ${orgCheckError.message}`,
      { orgId },
    )
  }

  if (!orgExists) {
    throw new DomainRegistrationError(ErrorCodes.ORG_NOT_FOUND, `Organization "${orgId}" not found or inaccessible`, {
      orgId,
    })
  }
}

/**
 * Create domain entry in app schema
 */
async function createDomainEntry(hostname: string, port: number, orgId: string): Promise<void> {
  // Get server ID for multi-server isolation
  const serverId = getServerId()
  if (!serverId) {
    throw new DomainRegistrationError(
      ErrorCodes.DEPLOYMENT_FAILED,
      "Server ID not configured. Set serverId in server-config.json (path from SERVER_CONFIG_PATH env var)",
      { domain: hostname },
    )
  }

  const app = await getAppClient()
  const { error: domainError } = await app.from("domains").insert({
    hostname,
    port,
    org_id: orgId,
    server_id: serverId,
    is_test_env: false,
  })

  if (domainError) {
    if (domainError.code === "23505") {
      throw new DomainRegistrationError(
        ErrorCodes.DOMAIN_ALREADY_EXISTS,
        `Domain "${hostname}" is already registered`,
        { domain: hostname },
      )
    }
    throw new DomainRegistrationError(
      ErrorCodes.DEPLOYMENT_FAILED,
      `Failed to register domain: ${domainError.message}`,
      { domain: hostname },
    )
  }
}

/**
 * Check whether a domain is already registered in app.domains
 */
export async function isDomainRegistered(hostname: string): Promise<boolean> {
  try {
    const app = await getAppClient()
    const { data, error } = await app.from("domains").select("hostname").eq("hostname", hostname).single()

    if (data) {
      return true
    }

    if (error && error.code !== "PGRST116") {
      throw new DomainRegistrationError(
        ErrorCodes.DEPLOYMENT_FAILED,
        `Failed to check if domain exists: ${error.message}`,
        { domain: hostname },
      )
    }

    return false
  } catch (error) {
    if (error instanceof DomainRegistrationError) {
      throw error
    }
    throw new DomainRegistrationError(
      ErrorCodes.DEPLOYMENT_FAILED,
      error instanceof Error ? error.message : "Unknown error checking domain registration",
      { domain: hostname },
    )
  }
}

/**
 * Register a new domain in Supabase
 * Creates user (if needed) and upserts organization, then creates domain entry
 *
 * FLOW:
 * 1. Create user account (if new) and validate password (if existing)
 * 2. Get or create user's default organization (if orgId not provided)
 * 3. Validate organization exists (if orgId provided)
 * 4. Create domain entry
 *
 * @throws {DomainRegistrationError} with error code and details
 * @returns true if successful
 */
export async function registerDomain(config: DomainRegistration): Promise<boolean> {
  const { hostname, email, password, port, orgId: providedOrgId } = config

  try {
    // Check if domain already exists
    if (await isDomainRegistered(hostname)) {
      return true
    }

    // Get or create user (validates password if provided)
    const userId = await getOrCreateUserId(email, password)

    // Resolve organization: use provided orgId (validate exists) or upsert default for user
    if (providedOrgId) {
      await validateProvidedOrgId(providedOrgId)
    }
    const orgId = providedOrgId || (await getUserDefaultOrgId(userId, email))

    // Create domain entry
    await createDomainEntry(hostname, port, orgId)

    return true
  } catch (error) {
    if (error instanceof DomainRegistrationError) {
      throw error
    }
    throw new DomainRegistrationError(
      ErrorCodes.INTERNAL_ERROR,
      error instanceof Error ? error.message : "Unknown error during domain registration",
    )
  }
}

/**
 * Unregister a domain from Supabase
 * Removes domain entry (org/memberships preserved for credit history)
 *
 * @throws {DomainRegistrationError} with error code and details
 * @returns true if successful
 */
export async function unregisterDomain(hostname: string): Promise<boolean> {
  try {
    const app = await getAppClient()

    // Check if domain exists
    const { data: domainData, error: domainCheckError } = await app
      .from("domains")
      .select("hostname")
      .eq("hostname", hostname)
      .single()

    if (domainCheckError && domainCheckError.code !== "PGRST116") {
      throw new DomainRegistrationError(
        ErrorCodes.DEPLOYMENT_FAILED,
        `Failed to check if domain exists: ${domainCheckError.message}`,
        { domain: hostname },
      )
    }

    if (!domainData) {
      return true
    }

    // Delete domain
    const { error } = await app.from("domains").delete().eq("hostname", hostname)

    if (error) {
      throw new DomainRegistrationError(
        ErrorCodes.DEPLOYMENT_FAILED,
        `Failed to unregister domain "${hostname}": ${error.message}`,
        { domain: hostname },
      )
    }

    return true
  } catch (error) {
    if (error instanceof DomainRegistrationError) {
      throw error
    }
    throw new DomainRegistrationError(
      ErrorCodes.DEPLOYMENT_FAILED,
      error instanceof Error ? error.message : "Unknown error during domain unregistration",
      { domain: hostname },
    )
  }
}
