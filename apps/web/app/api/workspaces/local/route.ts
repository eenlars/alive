/**
 * Local Workspaces API
 * Manages workspaces in standalone mode (no database dependency)
 *
 * GET: List all local workspaces
 * POST: Create a new local workspace
 */

import * as Sentry from "@sentry/nextjs"
import { env } from "@webalive/env/server"
import { STANDALONE } from "@webalive/shared"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"
import { verifySessionToken } from "@/features/auth/lib/jwt"
import { COOKIE_NAMES } from "@/lib/auth/cookies"
import { ErrorCodes, getErrorMessage } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

const CreateWorkspaceSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Workspace name can only contain letters, numbers, hyphens, and underscores"),
})

async function hasValidStandaloneSession(): Promise<boolean> {
  const jar = await cookies()
  const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

  if (!sessionCookie?.value) {
    return false
  }

  const payload = await verifySessionToken(sessionCookie.value)
  return payload?.userId === STANDALONE.TEST_USER.ID
}

/**
 * GET /api/workspaces/local
 * List all local workspaces
 */
export async function GET() {
  const requestId = generateRequestId()

  // Only available in standalone mode
  if (env.STREAM_ENV !== "standalone") {
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.INVALID_REQUEST,
        message: "This endpoint is only available in standalone mode (STREAM_ENV=standalone)",
        requestId,
      },
      { status: 400 },
    )
  }

  if (!(await hasValidStandaloneSession())) {
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.NO_SESSION,
        message: getErrorMessage(ErrorCodes.NO_SESSION),
        requestId,
      },
      { status: 401 },
    )
  }

  // Get local workspaces
  const { getStandaloneWorkspaces, getStandaloneWorkspaceBase } = await import(
    "@/features/workspace/lib/standalone-workspace"
  )

  const workspaces = getStandaloneWorkspaces()
  const basePath = getStandaloneWorkspaceBase()

  return NextResponse.json({
    ok: true,
    workspaces,
    basePath,
    requestId,
  })
}

/**
 * POST /api/workspaces/local
 * Create a new local workspace
 */
export async function POST(req: Request) {
  const requestId = generateRequestId()

  // Only available in standalone mode
  if (env.STREAM_ENV !== "standalone") {
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.INVALID_REQUEST,
        message: "This endpoint is only available in standalone mode (STREAM_ENV=standalone)",
        requestId,
      },
      { status: 400 },
    )
  }

  if (!(await hasValidStandaloneSession())) {
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.NO_SESSION,
        message: getErrorMessage(ErrorCodes.NO_SESSION),
        requestId,
      },
      { status: 401 },
    )
  }

  // Parse request body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.INVALID_JSON,
        message: getErrorMessage(ErrorCodes.INVALID_JSON),
        requestId,
      },
      { status: 400 },
    )
  }

  // Validate input
  const result = CreateWorkspaceSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.INVALID_REQUEST,
        message: getErrorMessage(ErrorCodes.INVALID_REQUEST),
        details: { issues: result.error.issues },
        requestId,
      },
      { status: 400 },
    )
  }

  const { name } = result.data

  // Check if workspace already exists
  const { standaloneWorkspaceExists, createStandaloneWorkspace } = await import(
    "@/features/workspace/lib/standalone-workspace"
  )

  if (standaloneWorkspaceExists(name)) {
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.WORKSPACE_EXISTS,
        message: `Workspace "${name}" already exists`,
        requestId,
      },
      { status: 409 },
    )
  }

  // Create workspace
  try {
    const path = createStandaloneWorkspace(name)
    console.log(`[Workspaces] Created standalone workspace: ${name} at ${path}`)

    return NextResponse.json({
      ok: true,
      workspace: {
        name,
        path,
      },
      requestId,
    })
  } catch (error) {
    console.error("[Workspaces] Failed to create workspace:", error)
    Sentry.captureException(error)
    return NextResponse.json(
      {
        ok: false,
        error: ErrorCodes.INTERNAL_ERROR,
        message: error instanceof Error ? error.message : "Failed to create workspace",
        requestId,
      },
      { status: 500 },
    )
  }
}
