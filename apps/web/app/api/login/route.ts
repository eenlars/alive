import { env } from "@webalive/env/server"
import { buildSessionOrgClaims, SECURITY, STANDALONE } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { createSessionToken } from "@/features/auth/lib/jwt"
import { createCorsResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { handleBody, isHandleBodyError } from "@/lib/api/server"
import { COOKIE_NAMES, getSessionCookieOptions } from "@/lib/auth/cookies"
import { addCorsHeaders } from "@/lib/cors-utils"
import { filterLocalDomains } from "@/lib/domains"
import { ErrorCodes, getErrorMessage } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"
import { createIamClient } from "@/lib/supabase/iam"
import { generateRequestId } from "@/lib/utils"
import { verifyPassword } from "@/types/guards/api"

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const origin = req.headers.get("origin")
  const host = req.headers.get("host") || undefined

  const parsed = await handleBody("login", req)
  if (isHandleBodyError(parsed)) {
    addCorsHeaders(parsed, origin)
    return parsed
  }

  const { email, password } = parsed

  // Standalone mode - auto-login with any credentials (for local development)
  if (process.env.STREAM_ENV === "standalone") {
    // Import workspace utilities
    const { getStandaloneWorkspaces, ensureDefaultWorkspace } = await import(
      "@/features/workspace/lib/standalone-workspace"
    )

    // Ensure at least one workspace exists
    ensureDefaultWorkspace()

    const workspaces = getStandaloneWorkspaces()
    const sessionToken = await createSessionToken({
      userId: STANDALONE.TEST_USER.ID,
      email: STANDALONE.TEST_USER.EMAIL,
      name: STANDALONE.TEST_USER.NAME,
      orgIds: [],
      orgRoles: {},
    })

    const res = createCorsSuccessResponse(origin, {
      userId: STANDALONE.TEST_USER.ID,
      workspaces,
    })
    res.cookies.set(COOKIE_NAMES.SESSION, sessionToken, getSessionCookieOptions(host))
    console.log(`[Login] Standalone mode: auto-login for ${email} with ${workspaces.length} local workspaces`)
    return res
  }

  // Test mode
  if (env.STREAM_ENV === "local" && email === SECURITY.LOCAL_TEST.EMAIL && password === SECURITY.LOCAL_TEST.PASSWORD) {
    const sessionToken = await createSessionToken({
      userId: SECURITY.LOCAL_TEST.SESSION_VALUE,
      email: SECURITY.LOCAL_TEST.EMAIL,
      name: "Test User",
      orgIds: [],
      orgRoles: {},
    })

    const res = createCorsSuccessResponse(origin, {})
    res.cookies.set(COOKIE_NAMES.SESSION, sessionToken, getSessionCookieOptions(host))
    return res
  }

  // Query user from iam.users
  const iam = await createIamClient("service")
  const { data: user, error: userError } = await iam
    .from("users")
    .select("user_id, email, password_hash, display_name")
    .eq("email", email)
    .single()

  if (userError || !user) {
    console.error("[Login] User not found:", email)
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.INVALID_CREDENTIALS,
        message: getErrorMessage(ErrorCodes.INVALID_CREDENTIALS),
        requestId,
      },
      401,
    )
  }

  // Verify password
  if (!user.password_hash) {
    console.error("[Login] User has no password_hash:", email)
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.INVALID_CREDENTIALS,
        message: getErrorMessage(ErrorCodes.INVALID_CREDENTIALS),
        requestId,
      },
      401,
    )
  }

  const isValid = await verifyPassword(password, user.password_hash)
  if (!isValid) {
    console.error("[Login] Invalid password for:", email)
    return createCorsResponse(
      origin,
      {
        ok: false,
        error: ErrorCodes.INVALID_CREDENTIALS,
        message: getErrorMessage(ErrorCodes.INVALID_CREDENTIALS),
        requestId,
      },
      401,
    )
  }

  // Query memberships and workspaces for login response payload.
  const { data: memberships } = await iam.from("org_memberships").select("org_id, role").eq("user_id", user.user_id)

  const workspaces: string[] = []
  const { orgIds, orgRoles } = buildSessionOrgClaims(memberships)
  if (orgIds.length > 0) {
    // Get all domains for these orgs (include is_test_env to handle test domains)
    const app = await createAppClient("service")
    const { data: domains } = await app.from("domains").select("hostname, is_test_env").in("org_id", orgIds)

    if (domains) {
      // Filter to only include domains that exist on THIS server
      // Exception: test domains (is_test_env=true) are always included - they don't exist on filesystem
      const realDomains = domains.filter(d => !d.is_test_env).map(d => d.hostname)
      const testDomains = domains.filter(d => d.is_test_env).map(d => d.hostname)
      workspaces.push(...filterLocalDomains(realDomains), ...testDomains)
    }
  }

  // Create JWT session token with scoped org access claims.
  const sessionToken = await createSessionToken({
    userId: user.user_id,
    email: user.email || "",
    name: user.display_name,
    orgIds,
    orgRoles,
  })

  console.log(`[Login] Successfully authenticated: ${user.email} (${workspaces.length} workspaces)`)

  // Return workspaces so client can validate localStorage selection
  const res = createCorsSuccessResponse(origin, { userId: user.user_id, workspaces })

  // Set session cookie (cookie name is versioned to avoid conflicts with old cookies)
  res.cookies.set(COOKIE_NAMES.SESSION, sessionToken, getSessionCookieOptions(host))
  return res
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 200 })
  addCorsHeaders(res, origin ?? null)
  return res
}
