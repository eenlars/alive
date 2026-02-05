import path from "node:path"
import type { NextRequest } from "next/server"
import { getSessionUser, verifyWorkspaceAccess, createErrorResponse } from "@/features/auth/lib/auth"
import { getWorkspace } from "@/features/chat/lib/workspaceRetriever"
import { WorktreeError, createWorktree, listWorktrees, removeWorktree } from "@/features/worktrees/lib/worktrees"
import { handleBody, isHandleBodyError, alrighty } from "@/lib/api/server"
import { type ErrorCode, ErrorCodes } from "@/lib/error-codes"
import { generateRequestId } from "@/lib/utils"

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
      return { code: ErrorCodes.WORKTREE_GIT_FAILED, status: 500, details }
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
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    const { searchParams } = new URL(req.url)
    workspace = (searchParams.get("workspace") || "").trim()

    if (!workspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_MISSING, 400, { requestId })
    }

    const authorized = await verifyWorkspaceAccess(user, { workspace }, `[Worktrees ${requestId}]`)
    if (!authorized) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, { requestId, workspace })
    }

    const host = req.headers.get("host") || "localhost"
    const workspaceResult = await getWorkspace({ host, body: { workspace }, requestId })
    if (!workspaceResult.success) {
      return workspaceResult.response
    }

    const worktrees = await listWorktrees(workspaceResult.workspace)

    return alrighty("worktrees", {
      ok: true,
      worktrees: worktrees.map(item => ({
        slug: item.slug,
        pathRelative: item.pathRelative,
        branch: item.branch,
        head: item.head,
      })),
    })
  } catch (error) {
    if (error instanceof WorktreeError) {
      const mapped = mapWorktreeError(error, { workspace })
      return createErrorResponse(mapped.code, mapped.status, { requestId, ...mapped.details })
    }

    console.error(`[Worktrees ${requestId}] GET error:`, error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  let body: { workspace: string; slug?: string; branch?: string; from?: string } | null = null

  try {
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    const parsed = await handleBody("worktrees/create", req)
    if (isHandleBodyError(parsed)) return parsed
    body = parsed

    if (!body.workspace?.trim()) {
      return createErrorResponse(ErrorCodes.WORKSPACE_MISSING, 400, { requestId })
    }

    const authorized = await verifyWorkspaceAccess(user, body, `[Worktrees ${requestId}]`)
    if (!authorized) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, { requestId, workspace: body.workspace })
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
        ok: true,
        slug: result.slug,
        branch: result.branch,
        worktreePath,
      },
      { status: 201 },
    )
  } catch (error) {
    if (error instanceof WorktreeError) {
      const mapped = mapWorktreeError(error, { workspace: body?.workspace, slug: body?.slug })
      return createErrorResponse(mapped.code, mapped.status, { requestId, ...mapped.details })
    }

    console.error(`[Worktrees ${requestId}] POST error:`, error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
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
      return createErrorResponse(ErrorCodes.NO_SESSION, 401, { requestId })
    }

    const { searchParams } = new URL(req.url)
    workspace = (searchParams.get("workspace") || "").trim()
    slug = (searchParams.get("slug") || "").trim()
    const deleteBranch = searchParams.get("deleteBranch") === "true"

    if (!workspace) {
      return createErrorResponse(ErrorCodes.WORKSPACE_MISSING, 400, { requestId })
    }

    if (!slug) {
      return createErrorResponse(ErrorCodes.MISSING_SLUG, 400, { requestId })
    }

    const authorized = await verifyWorkspaceAccess(user, { workspace }, `[Worktrees ${requestId}]`)
    if (!authorized) {
      return createErrorResponse(ErrorCodes.WORKSPACE_NOT_AUTHENTICATED, 401, { requestId, workspace })
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

    return alrighty("worktrees/delete", { ok: true })
  } catch (error) {
    if (error instanceof WorktreeError) {
      const mapped = mapWorktreeError(error, { workspace, slug })
      return createErrorResponse(mapped.code, mapped.status, { requestId, ...mapped.details })
    }

    console.error(`[Worktrees ${requestId}] DELETE error:`, error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      requestId,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
