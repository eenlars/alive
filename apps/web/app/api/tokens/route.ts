import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { isWorkspaceAuthenticated } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import type { TokensResponse } from "@/lib/api/types"
import { creditsToLLMTokens } from "@/lib/credits"
import { ErrorCodes } from "@/lib/error-codes"
import { getOrgCredits } from "@/lib/tokens"

export async function GET(req: NextRequest) {
  try {
    const workspace = req.headers.get("X-Workspace")

    if (!workspace) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_MISSING, { status: 400 })
    }

    // Verify user is authenticated for this workspace using JWT
    const isAuthenticated = await isWorkspaceAuthenticated(workspace)
    if (!isAuthenticated) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, { status: 401 })
    }

    // Load credits from Supabase (domain → org → credits)
    const credits = await getOrgCredits(workspace)

    if (credits === null) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_NOT_FOUND, { status: 404 })
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
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
