/**
 * Supabase Context API
 *
 * GET: Returns access token + project ref for Supabase tools
 * PUT: Updates the project ref for the organization
 *
 * The project ref is stored in lockbox using the user env keys pattern,
 * with key "SUPABASE_PROJECT_REF".
 */

import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { getOAuthInstance, getUserEnvKeysManager } from "@/lib/oauth/oauth-instances"

const SUPABASE_PROJECT_REF_KEY = "SUPABASE_PROJECT_REF"

/**
 * GET /api/integrations/supabase/context
 *
 * Returns the Supabase access token and project ref needed for tools.
 * Used internally by MCP tools to authenticate with Supabase Management API.
 *
 * Response:
 * - 200: { accessToken: string, projectRef: string }
 * - 401: Not authenticated or not connected to Supabase
 * - 404: Connected but no project configured
 */
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser()
  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  try {
    // Get Supabase OAuth manager
    const oauthManager = getOAuthInstance("supabase")

    // Check if connected
    const isConnected = await oauthManager.isConnected(user.id, "supabase")
    if (!isConnected) {
      return createErrorResponse(ErrorCodes.INTEGRATION_NOT_CONNECTED, 401, {
        provider: "supabase",
        message: "Not connected to Supabase. Please connect via Settings > Integrations.",
      })
    }

    // Get access token
    const accessToken = await oauthManager.getAccessToken(user.id, "supabase")
    if (!accessToken) {
      return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 401, {
        provider: "supabase",
        message: "Failed to get Supabase access token. Please reconnect.",
      })
    }

    // Get project ref from user env keys
    const envKeysManager = getUserEnvKeysManager()
    const envKeys = await envKeysManager.getAllUserEnvKeys(user.id)
    const projectRef = envKeys[SUPABASE_PROJECT_REF_KEY]

    if (!projectRef) {
      return createErrorResponse(ErrorCodes.INTEGRATION_NOT_CONFIGURED, 404, {
        provider: "supabase",
        message: "No Supabase project configured. Please select a project in Settings > Integrations > Supabase.",
      })
    }

    return NextResponse.json({
      accessToken,
      projectRef,
    })
  } catch (error) {
    console.error("[Supabase Context] Failed to get context:", error)
    return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, {
      provider: "supabase",
    })
  }
}

/**
 * PUT /api/integrations/supabase/context
 *
 * Updates the Supabase project ref for the user.
 *
 * Request body:
 * - projectRef: The Supabase project reference ID
 *
 * Response:
 * - 200: { ok: true, projectRef: string }
 * - 400: Invalid project ref
 * - 401: Not authenticated
 * - 500: Internal error
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser()
  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  try {
    const body = await req.json()
    const { projectRef } = body

    // Validate project ref format (alphanumeric, typically 20 chars)
    if (!projectRef || typeof projectRef !== "string") {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        reason: "projectRef is required",
      })
    }

    // Basic validation: Supabase project refs are alphanumeric
    const projectRefRegex = /^[a-zA-Z0-9]{10,30}$/
    if (!projectRefRegex.test(projectRef)) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        reason: "Invalid project ref format. Should be 10-30 alphanumeric characters.",
      })
    }

    // Check user is connected to Supabase first
    const oauthManager = getOAuthInstance("supabase")
    const isConnected = await oauthManager.isConnected(user.id, "supabase")
    if (!isConnected) {
      return createErrorResponse(ErrorCodes.INTEGRATION_NOT_CONNECTED, 401, {
        provider: "supabase",
        message: "Please connect to Supabase first before configuring a project.",
      })
    }

    // Store project ref in user env keys
    const envKeysManager = getUserEnvKeysManager()
    await envKeysManager.setUserEnvKey(user.id, SUPABASE_PROJECT_REF_KEY, projectRef)

    console.log("[Supabase Context] Project ref updated:", {
      userId: user.id.slice(0, 8),
      projectRef,
    })

    return NextResponse.json({
      ok: true,
      projectRef,
    })
  } catch (error) {
    console.error("[Supabase Context] Failed to update project ref:", error)
    return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, {
      provider: "supabase",
    })
  }
}

/**
 * DELETE /api/integrations/supabase/context
 *
 * Removes the Supabase project ref configuration.
 *
 * Response:
 * - 200: { ok: true }
 * - 401: Not authenticated
 * - 500: Internal error
 */
export async function DELETE(_req: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser()
  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  try {
    const envKeysManager = getUserEnvKeysManager()
    await envKeysManager.deleteUserEnvKey(user.id, SUPABASE_PROJECT_REF_KEY)

    console.log("[Supabase Context] Project ref removed for user:", user.id.slice(0, 8))

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Supabase Context] Failed to remove project ref:", error)
    return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, {
      provider: "supabase",
    })
  }
}
