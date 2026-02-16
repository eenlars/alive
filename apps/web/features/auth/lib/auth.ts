import { env } from "@webalive/env/server"
import { buildSessionOrgClaims, SECURITY, STANDALONE, SUPERADMIN } from "@webalive/shared"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { filterLocalDomains } from "@/lib/domains"
import { type ErrorCode, ErrorCodes, getErrorMessage } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"
import {
  SESSION_SCOPES,
  type SessionOrgRole,
  type SessionPayloadV3,
  type SessionScope,
  verifySessionToken,
} from "./jwt"

/**
 * Custom error class for authentication failures
 * Allows callers to discriminate auth errors without relying on string matching
 */
export class AuthenticationError extends Error {
  constructor(message = "Authentication required") {
    super(message)
    this.name = "AuthenticationError"
  }
}

export interface SessionUser {
  id: string
  email: string
  name: string | null
  /** Whether user can select any model without their own API key */
  canSelectAnyModel: boolean
  /** Whether user has admin privileges (can toggle feature flags, etc.) */
  isAdmin: boolean
  /** Whether user is a superadmin (can edit Bridge repo itself) */
  isSuperadmin: boolean
  /** Specific models this user is allowed to use (set via iam.users.metadata.enabled_models) */
  enabledModels: string[]
}

/**
 * Admin emails loaded from ADMIN_EMAILS environment variable.
 * These users can:
 * - Select any model without their own API key
 * - Toggle feature flags in Settings
 * Server-side only - never exposed to client code.
 *
 * Set via: ADMIN_EMAILS=admin1@example.com,admin2@example.com
 */
/** Pre-computed lowercase Sets — parsed once at module load, O(1) lookup */
const superadminEmails = new Set(SUPERADMIN.EMAILS.map((e: string) => e.toLowerCase()))
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean),
)

function isAdminUser(email: string): boolean {
  const lower = email.toLowerCase()
  return superadminEmails.has(lower) || adminEmails.has(lower)
}

/**
 * Build a SessionUser from email + enabled models.
 * Single place that derives isAdmin, isSuperadmin, canSelectAnyModel.
 */
function buildSessionUser(id: string, email: string, name: string | null, enabledModels: string[]): SessionUser {
  const lower = email.toLowerCase()
  const isSuperadmin = superadminEmails.has(lower)
  const isAdmin = isSuperadmin || adminEmails.has(lower)
  return {
    id,
    email,
    name,
    isAdmin,
    isSuperadmin,
    canSelectAnyModel: isAdmin || enabledModels.length > 0,
    enabledModels,
  }
}

/**
 * In-memory cache for per-user enabled models.
 * Avoids a DB round-trip on every getSessionUser() call.
 * TTL: 30 seconds — short enough to pick up admin changes quickly.
 */
const enabledModelsCache = new Map<string, { models: string[]; expiry: number }>()
const ENABLED_MODELS_CACHE_TTL_MS = 30_000
const AUTHZ_CACHE_TTL_MS = 5 * 60 * 1000

interface WorkspaceOrgCacheEntry {
  orgId: string | null
  expiry: number
}

interface UserOrgMembershipCacheEntry {
  orgIds: string[]
  orgRoles: Record<string, SessionOrgRole>
  expiry: number
}

const workspaceOrgCache = new Map<string, WorkspaceOrgCacheEntry>()
const userOrgMembershipCache = new Map<string, UserOrgMembershipCacheEntry>()

/**
 * Invalidate cached org memberships for a user.
 * Call this after membership mutations to avoid stale authz decisions.
 */
export function invalidateUserAuthzCache(userId: string): void {
  userOrgMembershipCache.delete(userId)
}

function hasScope(payload: SessionPayloadV3 | null, requiredScope: SessionScope): boolean {
  return Array.isArray(payload?.scopes) && payload.scopes.includes(requiredScope)
}

async function getSessionPayloadFromCookie(): Promise<SessionPayloadV3 | null> {
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    return null
  }

  return verifySessionToken(sessionCookie.value)
}

async function getWorkspaceOrgId(workspace: string): Promise<string | null> {
  const cached = workspaceOrgCache.get(workspace)
  if (cached && cached.expiry > Date.now()) {
    return cached.orgId
  }

  const app = await createAppClient("service")
  const { data, error } = await app.from("domains").select("org_id").eq("hostname", workspace).single()

  if (error) {
    // Don't cache failures; transient DB/network errors should be retryable.
    return null
  }

  const orgId = data?.org_id ?? null

  workspaceOrgCache.set(workspace, {
    orgId,
    expiry: Date.now() + AUTHZ_CACHE_TTL_MS,
  })

  return orgId
}

async function getUserOrgMemberships(userId: string): Promise<{
  orgIds: string[]
  orgRoles: Record<string, SessionOrgRole>
}> {
  const cached = userOrgMembershipCache.get(userId)
  if (cached && cached.expiry > Date.now()) {
    return {
      orgIds: cached.orgIds,
      orgRoles: cached.orgRoles,
    }
  }

  const iam = await createIamClient("service")
  const { data: memberships, error } = await iam.from("org_memberships").select("org_id, role").eq("user_id", userId)

  if (error) {
    // Don't cache failures; transient DB/network errors should be retryable.
    return { orgIds: [], orgRoles: {} }
  }

  if (!memberships || memberships.length === 0) {
    userOrgMembershipCache.set(userId, {
      orgIds: [],
      orgRoles: {},
      expiry: Date.now() + AUTHZ_CACHE_TTL_MS,
    })
    return { orgIds: [], orgRoles: {} }
  }

  const { orgIds: dedupedOrgIds, orgRoles } = buildSessionOrgClaims(memberships)
  userOrgMembershipCache.set(userId, {
    orgIds: dedupedOrgIds,
    orgRoles,
    expiry: Date.now() + AUTHZ_CACHE_TTL_MS,
  })

  return {
    orgIds: dedupedOrgIds,
    orgRoles,
  }
}

// Cleanup cache entries periodically to keep memory bounded in long-lived processes.
if (typeof setInterval !== "undefined" && typeof process !== "undefined" && !process.env.VITEST) {
  setInterval(
    () => {
      const now = Date.now()
      for (const [workspace, entry] of workspaceOrgCache.entries()) {
        if (entry.expiry <= now) {
          workspaceOrgCache.delete(workspace)
        }
      }
      for (const [userId, entry] of userOrgMembershipCache.entries()) {
        if (entry.expiry <= now) {
          userOrgMembershipCache.delete(userId)
        }
      }
    },
    10 * 60 * 1000,
  )
}

/**
 * Fetch per-user enabled models from iam.users.metadata.
 * Returns empty array if no models are configured.
 * This allows admins to grant specific model access to individual users
 * without making them full admins.
 *
 * Results are cached in-memory for 30 seconds to avoid a DB query on every request.
 */
async function fetchEnabledModels(userId: string): Promise<string[]> {
  const cached = enabledModelsCache.get(userId)
  if (cached && cached.expiry > Date.now()) {
    return cached.models
  }

  try {
    const iam = await createIamClient("service")
    const { data } = await iam.from("users").select("metadata").eq("user_id", userId).single()

    if (!data?.metadata || typeof data.metadata !== "object") {
      enabledModelsCache.set(userId, { models: [], expiry: Date.now() + ENABLED_MODELS_CACHE_TTL_MS })
      return []
    }

    const metadata = data.metadata as Record<string, unknown>
    const models = metadata.enabled_models
    if (!Array.isArray(models)) {
      enabledModelsCache.set(userId, { models: [], expiry: Date.now() + ENABLED_MODELS_CACHE_TTL_MS })
      return []
    }

    const result = models.filter((m): m is string => typeof m === "string")
    enabledModelsCache.set(userId, { models: result, expiry: Date.now() + ENABLED_MODELS_CACHE_TTL_MS })
    return result
  } catch {
    // Don't cache errors — retry on next call
    return []
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    return null
  }

  // Verify JWT and extract user data.
  const payload = await verifySessionToken(sessionCookie.value)

  if (!payload?.userId) {
    return null
  }

  if (env.STREAM_ENV === "standalone" && payload.userId === STANDALONE.TEST_USER.ID) {
    return {
      id: STANDALONE.TEST_USER.ID,
      email: STANDALONE.TEST_USER.EMAIL,
      name: STANDALONE.TEST_USER.NAME,
      canSelectAnyModel: true,
      isAdmin: true,
      isSuperadmin: false,
      enabledModels: [],
    }
  }

  if (env.STREAM_ENV === "local" && payload.userId === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return buildSessionUser(SECURITY.LOCAL_TEST.SESSION_VALUE, SECURITY.LOCAL_TEST.EMAIL, "Test User", [])
  }

  // Skip DB query for admins — they already get canSelectAnyModel: true
  if (isAdminUser(payload.email)) {
    return buildSessionUser(payload.userId, payload.email, payload.name, [])
  }

  // Fetch per-user enabled models from DB (lightweight query, cached 30s)
  const enabledModels = await fetchEnabledModels(payload.userId)

  return buildSessionUser(payload.userId, payload.email, payload.name, enabledModels)
}

export async function hasSessionScope(scope: SessionScope): Promise<boolean> {
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    return false
  }

  const payload = await verifySessionToken(sessionCookie.value)
  if (!payload) {
    return false
  }

  if (env.STREAM_ENV === "standalone" && payload.userId === STANDALONE.TEST_USER.ID) {
    return true
  }

  if (env.STREAM_ENV === "local" && payload.userId === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return true
  }

  return hasScope(payload, scope)
}

/**
 * Check if a workspace (domain) is authenticated in the current session
 * Queries user's org memberships and their associated domains
 */
export async function isWorkspaceAuthenticated(workspace: string): Promise<boolean> {
  const user = await getSessionUser()
  if (!user) {
    return false
  }

  // Standalone mode - verify workspace exists locally
  if (env.STREAM_ENV === "standalone" && user.id === STANDALONE.TEST_USER.ID) {
    const { isValidStandaloneWorkspaceName, standaloneWorkspaceExists } = await import(
      "@/features/workspace/lib/standalone-workspace"
    )
    if (!isValidStandaloneWorkspaceName(workspace)) {
      return false
    }
    return standaloneWorkspaceExists(workspace)
  }

  // Test mode allows all workspaces
  if (env.STREAM_ENV === "local" && user.id === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return true
  }

  // Superadmins can access any workspace
  if (user.isSuperadmin) {
    return true
  }

  const payload = await getSessionPayloadFromCookie()
  if (!payload || payload.userId !== user.id || !hasScope(payload, SESSION_SCOPES.WORKSPACE_ACCESS)) {
    return false
  }

  const orgId = await getWorkspaceOrgId(workspace)
  if (!orgId) {
    return false
  }

  const memberships = await getUserOrgMemberships(user.id)
  return memberships.orgIds.includes(orgId)
}

/**
 * Get list of authenticated workspaces (domains) from session
 * Uses JWT scope checks and organization membership/domain lookups.
 */
export async function getAuthenticatedWorkspaces(): Promise<string[]> {
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    return []
  }

  const payload = await verifySessionToken(sessionCookie.value)
  if (!payload) {
    return []
  }

  // Standalone mode - return all local workspaces
  if (env.STREAM_ENV === "standalone" && payload.userId === STANDALONE.TEST_USER.ID) {
    const { getStandaloneWorkspaces } = await import("@/features/workspace/lib/standalone-workspace")
    return getStandaloneWorkspaces()
  }

  // Test mode
  if (env.STREAM_ENV === "local" && payload.userId === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return []
  }

  if (!hasScope(payload, SESSION_SCOPES.WORKSPACE_LIST)) {
    return []
  }

  const app = await createAppClient("service")

  if (superadminEmails.has(payload.email.toLowerCase())) {
    const { data: allDomains } = await app.from("domains").select("hostname, is_test_env")
    const realDomains = allDomains?.filter(d => !d.is_test_env).map(d => d.hostname) || []
    const testDomains = allDomains?.filter(d => d.is_test_env).map(d => d.hostname) || []
    return [...filterLocalDomains(realDomains), ...testDomains]
  }

  const memberships = await getUserOrgMemberships(payload.userId)
  if (memberships.orgIds.length === 0) {
    return []
  }

  const { data: domains } = await app.from("domains").select("hostname, is_test_env").in("org_id", memberships.orgIds)
  const realDomains = domains?.filter(d => !d.is_test_env).map(d => d.hostname) || []
  const testDomains = domains?.filter(d => d.is_test_env).map(d => d.hostname) || []
  return [...filterLocalDomains(realDomains), ...testDomains].filter(w => w !== SUPERADMIN.WORKSPACE_NAME)
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) {
    throw new AuthenticationError()
  }
  return user
}

/**
 * Check if the manager workspace is authenticated
 * Special workspace for system administration
 * Uses separate manager_session cookie with JWT
 */
export async function isManagerAuthenticated(): Promise<boolean> {
  const jar = await cookies()
  const managerCookie = jar.get(COOKIE_NAMES.MANAGER_SESSION)

  if (!managerCookie?.value) {
    return false
  }

  // Verify JWT token (just like regular user sessions)
  const payload = await verifySessionToken(managerCookie.value)

  // Require dedicated manager identity + scope.
  return payload?.userId === "manager" && hasScope(payload, SESSION_SCOPES.MANAGER_ACCESS)
}

/**
 * Get JWT session cookie for passing to child processes
 *
 * @param logPrefix - Optional prefix for logs (e.g., "[Claude Stream xyz]")
 * @returns JWT session cookie value or undefined if not authenticated
 *
 * @example
 * const sessionCookie = await getSafeSessionCookie("[MyRoute abc123]")
 * runAgentChild(cwd, { sessionCookie, ...otherOptions })
 */
export async function getSafeSessionCookie(logPrefix = "[Auth]"): Promise<string | undefined> {
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    return undefined
  }

  // Verify JWT format and validity
  const payload = await verifySessionToken(sessionCookie.value)
  if (!payload) {
    console.warn(`${logPrefix} Invalid JWT session token`)
    return undefined
  }

  return sessionCookie.value
}

/**
 * Verify workspace authorization from request body
 *
 * Security: Ensures workspace is provided and user has access before any operations.
 * This prevents information leakage via filesystem checks on unauthorized workspaces.
 *
 * Uses JWT scopes + database-backed organization membership checks.
 *
 * @param user - Already authenticated user (from requireSessionUser)
 * @param body - Request body containing workspace parameter
 * @param logPrefix - Optional prefix for logs (e.g., "[Claude Stream xyz]")
 * @returns Workspace name if authorized, null if not
 *
 * @example
 * const user = await requireSessionUser()
 * const workspace = await verifyWorkspaceAccess(user, body, "[MyRoute]")
 * if (!workspace) {
 *   return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401)
 * }
 */
export async function verifyWorkspaceAccess(
  user: SessionUser,
  body: Record<string, unknown>,
  logPrefix = "[Auth]",
): Promise<string | null> {
  const workspace = body.workspace

  // Validate workspace is provided and is a string
  if (!workspace || typeof workspace !== "string" || workspace.trim() === "") {
    console.log(`${logPrefix} No workspace provided in request body`)
    return null
  }

  // SECURITY: Superadmin workspace (alive) requires SUPERADMIN status
  // This is defense-in-depth - even if someone adds it to their org,
  // they cannot access it without being a superadmin
  if (workspace === SUPERADMIN.WORKSPACE_NAME) {
    if (!user.isSuperadmin) {
      console.log(`${logPrefix} ⛔ BLOCKED: Non-superadmin attempted superadmin workspace access: ${user.email}`)
      return null
    }
    console.log(`${logPrefix} ✅ Superadmin access granted: ${user.email}`)
    return workspace
  }

  // Superadmins can access ANY workspace (for support/debugging)
  if (user.isSuperadmin) {
    console.log(`${logPrefix} ✅ Superadmin accessing workspace: ${workspace} (user: ${user.email})`)
    return workspace
  }

  // Standalone mode - verify workspace exists locally
  if (env.STREAM_ENV === "standalone" && user.id === STANDALONE.TEST_USER.ID) {
    const { isValidStandaloneWorkspaceName, standaloneWorkspaceExists } = await import(
      "@/features/workspace/lib/standalone-workspace"
    )
    if (!isValidStandaloneWorkspaceName(workspace)) {
      console.log(`${logPrefix} Invalid standalone workspace name: ${workspace}`)
      return null
    }
    if (standaloneWorkspaceExists(workspace)) {
      return workspace
    }
    console.log(`${logPrefix} Standalone workspace not found: ${workspace}`)
    return null
  }

  // Test mode allows all workspaces (except alive which is checked above)
  if (env.STREAM_ENV === "local" && user.id === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return workspace
  }

  // Validate JWT and scope before membership/domain checks.
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    console.log(`${logPrefix} No session cookie found`)
    return null
  }

  const payload = await verifySessionToken(sessionCookie.value)
  if (!payload || payload.userId !== user.id) {
    console.log(`${logPrefix} Invalid JWT`)
    return null
  }

  if (!hasScope(payload, SESSION_SCOPES.WORKSPACE_ACCESS)) {
    console.log(`${logPrefix} Missing scope ${SESSION_SCOPES.WORKSPACE_ACCESS}`)
    return null
  }

  const workspaceOrgId = await getWorkspaceOrgId(workspace)
  if (!workspaceOrgId) {
    console.log(`${logPrefix} Workspace not found: ${workspace}`)
    return null
  }

  const memberships = await getUserOrgMemberships(user.id)
  if (!memberships.orgIds.includes(workspaceOrgId)) {
    console.log(`${logPrefix} User not authenticated for workspace: ${workspace}`)
    return null
  }

  return workspace
}

/**
 * Create standardized error response
 *
 * @param error - Error code from ErrorCodes
 * @param status - HTTP status code
 * @param fields - Context for getErrorMessage() AND additional response fields
 *                 (message field will be filtered out if present)
 *
 * @example
 * // With message context
 * createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, { field: "email", requestId })
 * // Returns: { ok: false, error: "INVALID_REQUEST", message: "The email field...", category: "user", field: "email", requestId: "..." }
 *
 * @example
 * // With exception details
 * createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, { exception: err.message, requestId })
 * // Returns: { ok: false, error: "INTERNAL_ERROR", message: "Something went wrong...", category: "server", exception: "...", requestId: "..." }
 */
export function createErrorResponse(error: ErrorCode, status: number, fields?: Record<string, unknown>): NextResponse {
  // Remove 'message' from fields if present (prevent override of centralized message)
  const { message: _, ...safeFields } = fields || {}

  // Determine error category for frontend handling
  const category = status >= 500 ? "server" : "user"

  return NextResponse.json(
    {
      ok: false,
      error,
      message: getErrorMessage(error, fields), // Centralized message with dynamic context
      category, // 'user' (4xx) or 'server' (5xx)
      ...safeFields, // Include all other fields in response
    },
    { status },
  )
}

/**
 * Validate request with session and workspace authorization
 *
 * DRY helper that performs all common validation steps:
 * 1. Check session cookie exists
 * 2. Get authenticated user
 * 3. Parse and validate request body
 * 4. Verify workspace authorization
 *
 * @returns Either error response (return immediately) or validated data
 *
 * @example
 * const result = await validateRequest(req, requestId)
 * if ('error' in result) return result.error
 * const { user, body, workspace } = result.data
 */
export async function validateRequest(
  req: Request,
  requestId?: string,
): Promise<
  { error: NextResponse } | { data: { user: SessionUser; body: Record<string, unknown>; workspace: string } }
> {
  const logPrefix = requestId ? `[Request ${requestId}]` : "[Request]"

  // Check session cookie
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    console.log(`${logPrefix} No session cookie found`)
    return {
      error: createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId }),
    }
  }

  // Get authenticated user
  const user = await getSessionUser()
  if (!user) {
    console.log(`${logPrefix} Failed to get session user`)
    return {
      error: createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId }),
    }
  }

  // Parse request body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch (jsonError) {
    console.error(`${logPrefix} Failed to parse JSON body:`, jsonError)
    return {
      error: createErrorResponse(ErrorCodes.INVALID_JSON, 400, { requestId }),
    }
  }

  // Verify workspace authorization
  const workspace = await verifyWorkspaceAccess(user, body, logPrefix)
  if (!workspace) {
    return {
      error: createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, { requestId }),
    }
  }

  console.log(`${logPrefix} Request validated for user ${user.id}, workspace: ${workspace}`)

  return {
    data: { user, body, workspace },
  }
}

/**
 * Enhanced workspace authentication that combines user auth, workspace verification,
 * and workspace path resolution into a single call.
 *
 * This helper eliminates the need for separate calls to:
 * - requireSessionUser()
 * - verifyWorkspaceAccess()
 * - resolveWorkspace()
 *
 * @param req - Next.js request object
 * @param body - Request body containing workspace
 * @param requestId - Request ID for error responses
 * @returns Success with user/workspace/path or error response
 *
 * @example
 * const result = await requireWorkspaceAuth(req, body, requestId)
 * if (!result.success) {
 *   return result.error
 * }
 * const { user, workspace, workspacePath } = result.data
 */
export async function requireWorkspaceAuth(
  req: { headers: { get: (name: string) => string | null } },
  body: { workspace?: string },
  requestId?: string,
): Promise<
  | { success: true; data: { user: SessionUser; workspace: string; workspacePath: string } }
  | { success: false; error: NextResponse }
> {
  // Step 1: Authenticate user
  const user = await getSessionUser()
  if (!user) {
    return {
      success: false,
      error: createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId }),
    }
  }

  // Step 2: Verify workspace access
  const workspace = await verifyWorkspaceAccess(user, body, "[requireWorkspaceAuth]")
  if (!workspace) {
    return {
      success: false,
      error: createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, { requestId }),
    }
  }

  // Step 3: Resolve workspace path
  const { resolveWorkspace } = await import("@/features/workspace/lib/workspace-utils")
  const host = req.headers.get("host") || ""
  const workspaceResult = await resolveWorkspace(host, body, requestId || "unknown")

  if (!workspaceResult.success) {
    return {
      success: false,
      error: workspaceResult.response,
    }
  }

  return {
    success: true,
    data: {
      user,
      workspace,
      workspacePath: workspaceResult.workspace,
    },
  }
}
