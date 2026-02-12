import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse, isWorkspaceAuthenticated } from "@/features/auth/lib/auth"
import type { TokensResponse } from "@/lib/api/types"
import { creditsToLLMTokens } from "@/lib/credits"
import { ErrorCodes } from "@/lib/error-codes"
import { getOrgCredits } from "@/lib/tokens"

export async function GET(req: NextRequest) {
  try {
    const workspace = req.headers.get("X-Workspace")

    if (!workspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_MISSING, 400)
    }

    // Verify user is authenticated for this workspace using JWT
    const isAuthenticated = await isWorkspaceAuthenticated(workspace)
    if (!isAuthenticated) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401)
    }

    // Load credits from Supabase (domain → org → credits)
    const credits = await getOrgCredits(workspace)

    if (credits === null) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_FOUND, 404)
    }

    const tokens = creditsToLLMTokens(credits) // For backward compatibility

    return NextResponse.json<TokensResponse>({
      ok: true,
      tokens,
      credits,
      workspace,
    })
  } catch (error) {
    console.error("[Tokens] Error:", error)
    Sentry.captureException(error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }
}
