import path from "node:path"
import * as Sentry from "@sentry/nextjs"
import type { NextRequest } from "next/server"
import { getSessionUser, verifyWorkspaceAccess } from "@/features/auth/lib/auth"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import {
  createWorktree,
  type GitDiagnostics,
  listWorktrees,
  removeWorktree,
  WorktreeError,
} from "@/features/worktrees/lib/worktrees"
import { structuredErrorResponse } from "@/lib/api/responses"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { type ErrorCode, ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

function safeGitFailureDetails(
  diagnostics: GitDiagnostics | null,
  details?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...details,
    ...(diagnostics ? { operation: diagnostics.operation, exitCode: diagnostics.exitCode } : {}),
  }
}

function logGitFailure(
  requestId: string,
  error: WorktreeError,
  context: { workspace?: string; slug?: string; method: string },
) {
  const diag = error.gitDiagnostics
  console.error(
    JSON.stringify({
      level: "error",
      event: "WORKTREE_GIT_FAILED",
      requestId,
      method: context.method,
      workspace: context.workspace,
      slug: context.slug,
      operation: diag?.operation,
      exitCode: diag?.exitCode,
      stderrTail: diag?.stderrTail,
      gitArgs: diag?.gitArgs,
    }),
  )

  Sentry.withScope(scope => {
    scope.setTag("worktree.operation", diag?.operation ?? "unknown")
    scope.setTag("worktree.exitCode", String(diag?.exitCode ?? "unknown"))
    scope.setContext("worktree", {
      requestId,
      workspace: context.workspace,
      slug: context.slug,
      operation: diag?.operation,
      exitCode: diag?.exitCode,
      stderrTail: diag?.stderrTail,
      gitArgs: diag?.gitArgs,
    })
    Sentry.captureException(error)
  })
}

function mapWorktreeError(
  error: WorktreeError,
  details?: Record<string, unknown>,
): { code: ErrorCode; status: number; details?: Record<string, unknown> } {
  switch (error.code) {
    case "WORKTREE_INVALID_SLUG":
      return { code: ErrorCodes.WORKTREE_INVALID_SLUG, status: 400, details }
    case "WORKTREE_INVALID_BRANCH":
      return { code: ErrorCodes.WORKTREE_INVALID_BRANCH, status: 400, details }
    case "WORKTREE_INVALID_FROM":
      return { code: ErrorCodes.WORKTREE_INVALID_FROM, status: 400, details }
    case "WORKTREE_BASE_INVALID":
      return { code: ErrorCodes.WORKTREE_BASE_INVALID, status: 400, details }
    case "WORKTREE_NOT_FOUND":
      return { code: ErrorCodes.WORKTREE_NOT_FOUND, status: 404, details }
    case "WORKTREE_EXISTS":
      return { code: ErrorCodes.WORKTREE_EXISTS, status: 409, details }
    case "WORKTREE_BRANCH_IN_USE":
      return { code: ErrorCodes.WORKTREE_BRANCH_IN_USE, status: 409, details }
    case "WORKTREE_PATH_EXISTS":
      return { code: ErrorCodes.WORKTREE_PATH_EXISTS, status: 409, details }
    case "WORKTREE_LOCKED":
      return { code: ErrorCodes.WORKTREE_LOCKED, status: 409, details }
    case "WORKTREE_DIRTY":
      return { code: ErrorCodes.WORKTREE_DIRTY, status: 409, details }
    case "WORKTREE_BRANCH_UNKNOWN":
      return { code: ErrorCodes.WORKTREE_BRANCH_UNKNOWN, status: 400, details }
    case "WORKTREE_DELETE_BRANCH_BLOCKED":
      return { code: ErrorCodes.WORKTREE_DELETE_BRANCH_BLOCKED, status: 409, details }
    case "WORKTREE_NOT_GIT":
      return { code: ErrorCodes.WORKTREE_NOT_GIT, status: 404, details }
    case "WORKTREE_GIT_FAILED":
      return {
        code: ErrorCodes.WORKTREE_GIT_FAILED,
        status: 500,
        details: safeGitFailureDetails(error.gitDiagnostics, details),
      }
    default:
      return {
        code: ErrorCodes.INTERNAL_ERROR,
        status: 500,
        details: { message: error.message, worktreeError: error.code, ...details },
      }
  }
}

export async function GET(req: NextRequest) {
  const requestId = generateRequestId()
  let workspace = ""

  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    const { searchParams } = new URL(req.url)
    workspace = (searchParams.get("workspace") || "").trim()

    if (!workspace) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_MISSING, { status: 400, details: { requestId } })
    }

    const authorized = await verifyWorkspaceAccess(user, { workspace }, `[Worktrees ${requestId}]`)
    if (!authorized) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, {
        status: 401,
        details: { requestId, workspace },
      })
    }

    const host = req.headers.get("host") || "localhost"
    const workspaceResult = await getWorkspace({ host, body: { workspace }, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const worktrees = await listWorktrees(workspaceResult.workspace)

    return alrighty("worktrees", {
      worktrees: worktrees.map(item => ({
        slug: item.slug,
        pathRelative: item.pathRelative,
        branch: item.branch,
        head: item.head,
      })),
    })
  } catch (error) {
    if (error instanceof WorktreeError) {
      if (error.code === "WORKTREE_GIT_FAILED") {
        logGitFailure(requestId, error, { workspace, method: "GET" })
      }
      const mapped = mapWorktreeError(error, { workspace })
      return structuredErrorResponse(mapped.code, { status: mapped.status, details: { requestId, ...mapped.details } })
    }

    console.error(`[Worktrees ${requestId}] GET error:`, error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  let body: { workspace: string; slug?: string; branch?: string; from?: string } | null = null

  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    const parsed = await handleBody("worktrees/create", req)
    if (isHandleBodyError(parsed)) return parsed
    body = {
      workspace: parsed.workspace,
      slug: parsed.slug ?? undefined,
      branch: parsed.branch,
      from: parsed.from,
    }

    if (!body.workspace?.trim()) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_MISSING, { status: 400, details: { requestId } })
    }

    const authorized = await verifyWorkspaceAccess(user, body, `[Worktrees ${requestId}]`)
    if (!authorized) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, {
        status: 401,
        details: { requestId, workspace: body.workspace },
      })
    }

    const host = req.headers.get("host") || "localhost"
    const workspaceResult = await getWorkspace({ host, body, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const result = await createWorktree({
      baseWorkspacePath: workspaceResult.workspace,
      slug: body.slug,
      branch: body.branch,
      from: body.from,
    })

    const worktreeRoot = path.join(path.dirname(workspaceResult.workspace), "worktrees")
    const worktreePath = path.relative(worktreeRoot, result.worktreePath)

    return alrighty(
      "worktrees/create",
      {
        slug: result.slug,
        branch: result.branch,
        worktreePath,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof WorktreeError) {
      if (error.code === "WORKTREE_GIT_FAILED") {
        logGitFailure(requestId, error, { workspace: body?.workspace, slug: body?.slug, method: "POST" })
      }
      const mapped = mapWorktreeError(error, { workspace: body?.workspace, slug: body?.slug })
      return structuredErrorResponse(mapped.code, { status: mapped.status, details: { requestId, ...mapped.details } })
    }

    console.error(`[Worktrees ${requestId}] POST error:`, error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}

export async function DELETE(req: NextRequest) {
  const requestId = generateRequestId()
  let workspace = ""
  let slug = ""

  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.NO_SESSION, { status: 401, details: { requestId } })
    }

    const { searchParams } = new URL(req.url)
    workspace = (searchParams.get("workspace") || "").trim()
    slug = (searchParams.get("slug") || "").trim()
    const deleteBranch = searchParams.get("deleteBranch") === "true"

    if (!workspace) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_MISSING, { status: 400, details: { requestId } })
    }

    if (!slug) {
      return structuredErrorResponse(ErrorCodes.MISSING_SLUG, { status: 400, details: { requestId } })
    }

    const authorized = await verifyWorkspaceAccess(user, { workspace }, `[Worktrees ${requestId}]`)
    if (!authorized) {
      return structuredErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, {
        status: 401,
        details: { requestId, workspace },
      })
    }

    const host = req.headers.get("host") || "localhost"
    const workspaceResult = await getWorkspace({ host, body: { workspace }, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    await removeWorktree({
      baseWorkspacePath: workspaceResult.workspace,
      slug,
      deleteBranch,
    })

    return alrighty("worktrees/delete", {})
  } catch (error) {
    if (error instanceof WorktreeError) {
      if (error.code === "WORKTREE_GIT_FAILED") {
        logGitFailure(requestId, error, { workspace, slug, method: "DELETE" })
      }
      const mapped = mapWorktreeError(error, { workspace, slug })
      return structuredErrorResponse(mapped.code, { status: mapped.status, details: { requestId, ...mapped.details } })
    }

    console.error(`[Worktrees ${requestId}] DELETE error:`, error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: {
        requestId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
    })
  }
}
