/**
 * Linear Issues API
 *
 * Fetches the current user's assigned issues from Linear.
 * Requires the user to have connected their Linear account via OAuth.
 */

import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"
import { getLinearOAuth } from "@/lib/oauth/oauth-instances"

interface LinearIssue {
  id: string
  identifier: string
  title: string
  description?: string
  priority: number
  priorityLabel: string
  state: {
    id: string
    name: string
    color: string
    type: string
  }
  url: string
  createdAt: string
  updatedAt: string
}

interface LinearIssuesResponse {
  issues: LinearIssue[]
  totalCount: number
}

/**
 * GET /api/linear/issues
 *
 * Fetches issues assigned to the current user.
 *
 * Query params:
 * - limit: number (default 25, max 50)
 * - includeCompleted: boolean (default false)
 */
export async function GET(req: Request): Promise<NextResponse> {
  // 1. Authenticate user
  const user = await getSessionUser()
  if (!user) {
    return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
  }

  // 2. Get Linear OAuth token
  const linearOAuth = getLinearOAuth()
  let accessToken: string

  try {
    const token = await linearOAuth.getAccessToken(user.id, "linear")
    if (!token) {
      return createErrorResponse(ErrorCodes.INTEGRATION_NOT_CONNECTED, 400, {
        provider: "linear",
        message: "Connect Linear in Settings to view your issues",
      })
    }
    accessToken = token
  } catch (_err) {
    // Expected: OAuth token may not exist for this user
    return createErrorResponse(ErrorCodes.INTEGRATION_NOT_CONNECTED, 400, {
      provider: "linear",
      message: "Connect Linear in Settings to view your issues",
    })
  }

  // 3. Parse query params
  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get("limit")) || 25, 50)
  const includeCompleted = url.searchParams.get("includeCompleted") === "true"

  // 4. Fetch issues from Linear GraphQL API
  try {
    const issues = await fetchLinearIssues(accessToken, { limit, includeCompleted })

    return NextResponse.json({
      ok: true,
      ...issues,
    })
  } catch (error) {
    console.error("[Linear Issues] Failed to fetch:", error)
    Sentry.captureException(error)

    return createErrorResponse(ErrorCodes.INTEGRATION_ERROR, 500, {
      provider: "linear",
      message: "Failed to fetch issues from Linear",
    })
  }
}

/**
 * Fetch issues assigned to the authenticated user from Linear
 */
async function fetchLinearIssues(
  accessToken: string,
  options: { limit: number; includeCompleted: boolean },
): Promise<LinearIssuesResponse> {
  // Import query builder (tested separately to prevent GraphQL validation errors)
  const { buildLinearIssuesQuery } = await import("./query-builder")
  const query = buildLinearIssuesQuery(options)

  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      query,
      variables: { limit: options.limit },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Linear API error: ${response.status} ${errorText}`)
  }

  const data = await response.json()

  if (data.errors) {
    throw new Error(`Linear GraphQL error: ${data.errors.map((e: { message: string }) => e.message).join(", ")}`)
  }

  const nodes = data.data?.viewer?.assignedIssues?.nodes || []

  return {
    issues: nodes.map((issue: LinearIssue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      state: issue.state,
      url: issue.url,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    })),
    totalCount: nodes.length,
  }
}
