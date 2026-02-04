import { env } from "@webalive/env/server"
import { SECURITY, SUPERADMIN } from "@webalive/shared"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { type ErrorCode, ErrorCodes, getErrorMessage } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"
import { verifySessionToken } from "./jwt"

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
function getAdminEmails(): string[] {
  const envValue = process.env.ADMIN_EMAILS
  if (!envValue) return []
  return envValue
    .split(",")
    .map(e => e.trim())
    .filter(Boolean)
}

function isAdminUser(email: string): boolean {
  const adminEmails = getAdminEmails()
  return adminEmails.some(e => e.toLowerCase() === email.toLowerCase())
}

/**
 * Check if user is a superadmin (can edit Bridge repo).
 * Uses SUPERADMIN.EMAILS from @webalive/shared.
 */
function isSuperadminUser(email: string): boolean {
  return SUPERADMIN.EMAILS.some((e: string) => e.toLowerCase() === email.toLowerCase())
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    return null
  }

  // Test mode
  if (env.BRIDGE_ENV === "local" && sessionCookie.value === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    const testEmail = SECURITY.LOCAL_TEST.EMAIL
    const isAdmin = isAdminUser(testEmail)
    const isSuperadmin = isSuperadminUser(testEmail)
    return {
      id: SECURITY.LOCAL_TEST.SESSION_VALUE,
      email: testEmail,
      name: "Test User",
      canSelectAnyModel: isAdmin,
      isAdmin,
      isSuperadmin,
    }
  }

  // Verify JWT and extract user data (NO DATABASE QUERY - all data in JWT)
  const payload = await verifySessionToken(sessionCookie.value)

  if (!payload?.userId) {
    return null
  }

  // Return user data directly from JWT (eliminates iam.users query)
  // Old tokens without email/workspaces will be rejected by verifySessionToken
  const isAdmin = isAdminUser(payload.email)
  const isSuperadmin = isSuperadminUser(payload.email)
  return {
    id: payload.userId,
    email: payload.email,
    name: payload.name,
    canSelectAnyModel: isAdmin,
    isAdmin,
    isSuperadmin,
  }
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

  // Test mode allows all workspaces
  if (env.BRIDGE_ENV === "local" && user.id === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return true
  }

  // Get user's org memberships
  const iam = await createIamClient("service")
  const { data: memberships } = await iam.from("org_memberships").select("org_id").eq("user_id", user.id)

  if (!memberships || memberships.length === 0) {
    return false
  }

  const orgIds = memberships.map(m => m.org_id)

  // Check if any of user's orgs has this domain
  const app = await createAppClient("service")
  const { data: domain } = await app
    .from("domains")
    .select("domain_id")
    .eq("hostname", workspace)
    .in("org_id", orgIds)
    .single()

  return !!domain
}

/**
 * Get list of authenticated workspaces (domains) from session
 * Returns all domains from JWT workspaces array (NO DATABASE QUERIES)
 */
export async function getAuthenticatedWorkspaces(): Promise<string[]> {
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    return []
  }

  // Test mode
  if (env.BRIDGE_ENV === "local" && sessionCookie.value === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return []
  }

  // Get workspaces from JWT (eliminates org_memberships + domains queries)
  const payload = await verifySessionToken(sessionCookie.value)
  if (!payload?.workspaces) {
    return []
  }

  return payload.workspaces
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

  // Check if it's a manager token (userId === "manager")
  return payload?.userId === "manager"
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

  // Test mode special value
  if (env.BRIDGE_ENV === "local" && sessionCookie.value === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return sessionCookie.value
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
 * Uses JWT workspaces array to verify access (NO DATABASE QUERIES).
 * Workspace list is embedded in JWT at login time.
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

  // SECURITY: alive workspace requires SUPERADMIN status
  // This is defense-in-depth - even if someone adds alive to their org,
  // they cannot access it without being a superadmin
  if (workspace === SUPERADMIN.WORKSPACE_NAME) {
    if (!user.isSuperadmin) {
      console.log(`${logPrefix} ⛔ BLOCKED: Non-superadmin attempted alive access: ${user.email}`)
      return null
    }
    console.log(`${logPrefix} ✅ Superadmin access granted for alive: ${user.email}`)
    return workspace
  }

  // Test mode allows all workspaces (except alive which is checked above)
  if (env.BRIDGE_ENV === "local" && user.id === SECURITY.LOCAL_TEST.SESSION_VALUE) {
    return workspace
  }

  // Get workspaces from JWT (NO DATABASE QUERY - data already in session)
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    console.log(`${logPrefix} No session cookie found`)
    return null
  }

  const payload = await verifySessionToken(sessionCookie.value)
  if (!payload?.workspaces) {
    console.log(`${logPrefix} Invalid JWT or missing workspaces`)
    return null
  }

  // Check if workspace is in user's authorized list (eliminates org_memberships + domains queries)
  if (!payload.workspaces.includes(workspace)) {
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
  const workspaceResult = resolveWorkspace(host, body, requestId || "unknown")

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
