/**
 * Worktree Management Library
 *
 * SECURITY NOTE: Path traversal protection layers
 * ================================================
 * This module is protected against path traversal attacks through multiple layers:
 *
 * 1. baseWorkspacePath validation (upstream in workspaceRetriever.ts):
 *    - Path normalization rejects ".." components
 *    - Only allows paths under /srv/webalive/sites/
 *    - Verifies path exists before returning
 *
 * 2. Slug validation (SLUG_REGEX + RESERVED_SLUGS):
 *    - Only allows [a-z0-9][a-z0-9-]{0,48} - no path separators or special chars
 *    - Explicitly blocks ".", "..", "user", "worktrees"
 *    - Enforced by assertValidSlug() before any path construction
 *
 * 3. Symlink resolution (in resolveWorktreePath):
 *    - Uses fs.realpathSync() to resolve symlinks BEFORE validation
 *    - Calls ensurePathWithinWorkspace() on the resolved path
 *    - Prevents symlink-based escapes
 *
 * 4. Constants-based path construction:
 *    - All derived paths use path.join() with hardcoded constants
 *    - No user input interpolated beyond the validated slug
 *
 * Additional isPathWithinWorkspace() guards are not needed because:
 * - The slug regex prevents path separator injection
 * - All paths are built from validated baseWorkspacePath + constants + validated slug
 * - The only user-controlled path (worktree target) is validated after symlink resolution
 *
 * Last reviewed: 2026-02-05 (CodeRabbit issue #false-positive)
 */
import fs from "node:fs"
import path from "node:path"
import { runAsWorkspaceUser } from "@/lib/workspace-execution/command-runner"
import { ensurePathWithinWorkspace } from "@/features/workspace/lib/workspace-secure"

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,48}$/
const RESERVED_SLUGS = new Set(["user", "worktrees", ".", ".."])

export interface WorktreeEntry {
  path: string
  branch: string | null
  head: string | null
  isDetached: boolean
  isBare: boolean
}

export interface WorktreeListItem {
  slug: string
  path: string
  pathRelative: string
  branch: string | null
  head: string | null
}

export class WorktreeError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function formatTimestampUTC(date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, "0")
  const d = String(date.getUTCDate()).padStart(2, "0")
  const hh = String(date.getUTCHours()).padStart(2, "0")
  const mm = String(date.getUTCMinutes()).padStart(2, "0")
  return `${y}${m}${d}-${hh}${mm}`
}

function getSiteRoot(baseWorkspacePath: string): string {
  return path.dirname(baseWorkspacePath)
}

function getWorktreeRoot(baseWorkspacePath: string): string {
  return path.join(getSiteRoot(baseWorkspacePath), "worktrees")
}

function getLockPath(baseWorkspacePath: string): string {
  return path.join(baseWorkspacePath, ".git", "bridge-worktree.lock")
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase()
}

function assertValidSlug(slug: string) {
  if (!SLUG_REGEX.test(slug)) {
    throw new WorktreeError("WORKTREE_INVALID_SLUG", `Invalid worktree slug: ${slug}`)
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new WorktreeError("WORKTREE_INVALID_SLUG", `Reserved worktree slug: ${slug}`)
  }
}

async function runGit(baseWorkspacePath: string, args: string[], timeout?: number) {
  const result = await runAsWorkspaceUser({
    command: "git",
    args: ["-C", baseWorkspacePath, ...args],
    workspaceRoot: baseWorkspacePath,
    timeout,
  })

  if (!result.success) {
    throw new WorktreeError(
      "WORKTREE_GIT_FAILED",
      `Git failed: git -C ${baseWorkspacePath} ${args.join(" ")}\n${result.stderr}`,
    )
  }

  return result.stdout.trim()
}

async function gitRefExists(baseWorkspacePath: string, ref: string): Promise<boolean> {
  const result = await runAsWorkspaceUser({
    command: "git",
    args: ["-C", baseWorkspacePath, "rev-parse", "--verify", ref],
    workspaceRoot: baseWorkspacePath,
    timeout: 15000,
  })

  return result.success
}

async function assertBranchName(baseWorkspacePath: string, branch: string) {
  const result = await runAsWorkspaceUser({
    command: "git",
    args: ["-C", baseWorkspacePath, "check-ref-format", "--branch", branch],
    workspaceRoot: baseWorkspacePath,
    timeout: 15000,
  })

  if (!result.success) {
    throw new WorktreeError("WORKTREE_INVALID_BRANCH", `Invalid branch name: ${branch}`)
  }
}

async function assertBaseRepo(baseWorkspacePath: string) {
  const gitDir = path.join(baseWorkspacePath, ".git")
  let stat: fs.Stats | null = null

  try {
    stat = fs.statSync(gitDir)
  } catch {
    stat = null
  }

  if (!stat) {
    throw new WorktreeError("WORKTREE_NOT_GIT", `Base workspace is not a git repo: ${baseWorkspacePath}`)
  }

  if (!stat.isDirectory()) {
    throw new WorktreeError("WORKTREE_BASE_INVALID", `Base workspace must be a git root: ${baseWorkspacePath}`)
  }

  await runGit(baseWorkspacePath, ["rev-parse", "--git-dir"], 15000)
}

function ensureWorktreeRoot(baseWorkspacePath: string): string {
  const worktreeRoot = getWorktreeRoot(baseWorkspacePath)
  if (!fs.existsSync(worktreeRoot)) {
    fs.mkdirSync(worktreeRoot, { recursive: true })
    try {
      const st = fs.statSync(baseWorkspacePath)
      fs.chownSync(worktreeRoot, st.uid, st.gid)
    } catch {
      // Best-effort: ownership correction is not critical for local dev.
    }
  }
  return worktreeRoot
}

async function assertFromRef(baseWorkspacePath: string, from: string) {
  const result = await runAsWorkspaceUser({
    command: "git",
    args: ["-C", baseWorkspacePath, "rev-parse", "--verify", from],
    workspaceRoot: baseWorkspacePath,
    timeout: 15000,
  })

  if (!result.success) {
    throw new WorktreeError("WORKTREE_INVALID_FROM", `Invalid base ref: ${from}`)
  }
}

async function withWorktreeLock<T>(baseWorkspacePath: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = getLockPath(baseWorkspacePath)
  let fd: number | null = null

  try {
    fd = fs.openSync(lockPath, "wx")
  } catch (error: any) {
    if (error?.code === "EEXIST") {
      throw new WorktreeError("WORKTREE_LOCKED", "Worktree operation already in progress")
    }
    throw error
  }

  try {
    const st = fs.statSync(baseWorkspacePath)
    try {
      fs.fchownSync(fd, st.uid, st.gid)
    } catch {
      // Best-effort: lock ownership is not critical for correctness.
    }

    const payload = JSON.stringify({ pid: process.pid, at: new Date().toISOString() })
    fs.writeSync(fd, payload)

    return await fn()
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {
        // Ignore close errors
      }
    }
    try {
      fs.unlinkSync(lockPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}

function parseWorktreeList(output: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  const lines = output.split(/\r?\n/)

  let current: WorktreeEntry | null = null

  for (const line of lines) {
    if (!line.trim()) {
      if (current) {
        entries.push(current)
        current = null
      }
      continue
    }

    if (line.startsWith("worktree ")) {
      if (current) {
        entries.push(current)
      }
      current = {
        path: line.slice("worktree ".length).trim(),
        branch: null,
        head: null,
        isDetached: false,
        isBare: false,
      }
      continue
    }

    if (!current) {
      continue
    }

    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length).trim()
      continue
    }

    if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).trim()
      continue
    }

    if (line.startsWith("detached")) {
      current.isDetached = true
      continue
    }

    if (line.startsWith("bare")) {
      current.isBare = true
    }
  }

  if (current) {
    entries.push(current)
  }

  return entries
}

function toBranchName(ref: string | null): string | null {
  if (!ref) return null
  const prefix = "refs/heads/"
  return ref.startsWith(prefix) ? ref.slice(prefix.length) : ref
}

function safeRealpath(target: string): string | null {
  try {
    return fs.realpathSync(target)
  } catch {
    return null
  }
}

function isBranchInUse(worktrees: WorktreeListItem[], branchName: string): boolean {
  return worktrees.some(item => item.branch === branchName)
}

function isSlugAllowed(slug: string): boolean {
  if (!SLUG_REGEX.test(slug)) return false
  if (RESERVED_SLUGS.has(slug)) return false
  return true
}

export async function listWorktrees(baseWorkspacePath: string): Promise<WorktreeListItem[]> {
  await assertBaseRepo(baseWorkspacePath)

  const worktreeRoot = getWorktreeRoot(baseWorkspacePath)
  if (!fs.existsSync(worktreeRoot)) {
    return []
  }
  const output = await runGit(baseWorkspacePath, ["worktree", "list", "--porcelain"])
  const entries = parseWorktreeList(output)

  const worktreeRootReal = safeRealpath(worktreeRoot)
  if (!worktreeRootReal) {
    return []
  }

  return entries
    .map(entry => {
      const entryReal = safeRealpath(entry.path)
      return { entry, entryReal }
    })
    .filter(({ entryReal }) => entryReal?.startsWith(worktreeRootReal + path.sep))
    .map(({ entry, entryReal }) => {
      if (!entryReal) return null
      const relative = path.relative(worktreeRootReal, entryReal)
      if (!relative || relative.includes(path.sep)) {
        return null
      }
      if (!isSlugAllowed(relative)) {
        return null
      }
      return {
        slug: relative,
        path: entryReal,
        pathRelative: relative,
        branch: toBranchName(entry.branch),
        head: entry.head,
      }
    })
    .filter((item): item is WorktreeListItem => item !== null)
}

export async function resolveWorktreePath(baseWorkspacePath: string, slug: string): Promise<string> {
  const normalized = normalizeSlug(slug)
  assertValidSlug(normalized)

  const worktreeRoot = getWorktreeRoot(baseWorkspacePath)
  const worktreeRootReal = safeRealpath(worktreeRoot)
  if (!worktreeRootReal) {
    throw new WorktreeError("WORKTREE_NOT_FOUND", `Worktree root missing for ${normalized}`)
  }

  const target = path.join(worktreeRootReal, normalized)
  const targetReal = safeRealpath(target)
  if (!targetReal) {
    throw new WorktreeError("WORKTREE_NOT_FOUND", `Worktree not found: ${normalized}`)
  }

  ensurePathWithinWorkspace(targetReal, worktreeRootReal)

  const worktrees = await listWorktrees(baseWorkspacePath)
  const match = worktrees.find(item => item.path === targetReal)

  if (!match) {
    throw new WorktreeError("WORKTREE_NOT_FOUND", `Worktree not found: ${normalized}`)
  }

  return targetReal
}

export interface CreateWorktreeInput {
  baseWorkspacePath: string
  slug?: string
  branch?: string
  from?: string
}

export interface CreateWorktreeResult {
  slug: string
  branch: string
  worktreePath: string
}

export async function createWorktree({
  baseWorkspacePath,
  slug,
  branch,
  from,
}: CreateWorktreeInput): Promise<CreateWorktreeResult> {
  await assertBaseRepo(baseWorkspacePath)

  const worktreeRoot = ensureWorktreeRoot(baseWorkspacePath)

  const normalizedSlug = normalizeSlug(slug ?? `wt-${formatTimestampUTC()}`)
  assertValidSlug(normalizedSlug)

  const baseRef = from ?? (await runGit(baseWorkspacePath, ["rev-parse", "--abbrev-ref", "HEAD"]))
  if (from) {
    await assertFromRef(baseWorkspacePath, from)
  }

  const defaultBranch = `worktree/${normalizedSlug}`
  const requestedBranch = branch?.trim() || defaultBranch
  await assertBranchName(baseWorkspacePath, requestedBranch)

  const worktreePath = path.join(worktreeRoot, normalizedSlug)

  return await withWorktreeLock(baseWorkspacePath, async () => {
    const existing = await listWorktrees(baseWorkspacePath)
    if (existing.some(item => item.slug === normalizedSlug)) {
      throw new WorktreeError("WORKTREE_EXISTS", `Worktree already exists: ${normalizedSlug}`)
    }

    let branchName = requestedBranch
    if (!branch) {
      let attempt = 0
      while (
        (await gitRefExists(baseWorkspacePath, `refs/heads/${branchName}`)) ||
        isBranchInUse(existing, branchName)
      ) {
        attempt += 1
        branchName = `${requestedBranch}-${attempt}`
      }
    } else if (isBranchInUse(existing, branchName)) {
      throw new WorktreeError("WORKTREE_BRANCH_IN_USE", `Branch already checked out: ${branchName}`)
    }

    if (fs.existsSync(worktreePath)) {
      throw new WorktreeError("WORKTREE_PATH_EXISTS", `Worktree path already exists: ${normalizedSlug}`)
    }

    const branchExists = await gitRefExists(baseWorkspacePath, `refs/heads/${branchName}`)
    if (branchExists && branch) {
      await runGit(baseWorkspacePath, ["worktree", "add", worktreePath, branchName])
    } else {
      await runGit(baseWorkspacePath, ["worktree", "add", worktreePath, "-b", branchName, baseRef])
    }

    return {
      slug: normalizedSlug,
      branch: branchName,
      worktreePath,
    }
  })
}

export interface RemoveWorktreeInput {
  baseWorkspacePath: string
  slug: string
  deleteBranch?: boolean
  allowDirty?: boolean
}

export async function removeWorktree({
  baseWorkspacePath,
  slug,
  deleteBranch = false,
  allowDirty = false,
}: RemoveWorktreeInput): Promise<void> {
  const targetPath = await resolveWorktreePath(baseWorkspacePath, slug)

  await withWorktreeLock(baseWorkspacePath, async () => {
    const worktrees = await listWorktrees(baseWorkspacePath)
    const match = worktrees.find(item => item.path === targetPath)
    const branchName = match?.branch

    if (!allowDirty) {
      const status = await runGit(targetPath, ["status", "--porcelain"], 15000)
      if (status) {
        throw new WorktreeError("WORKTREE_DIRTY", "Worktree has uncommitted changes")
      }
    }

    if (deleteBranch) {
      if (!branchName) {
        throw new WorktreeError("WORKTREE_BRANCH_UNKNOWN", "Cannot delete branch for detached worktree")
      }

      const baseBranch = await runGit(baseWorkspacePath, ["rev-parse", "--abbrev-ref", "HEAD"])
      if (baseBranch === branchName) {
        throw new WorktreeError("WORKTREE_DELETE_BRANCH_BLOCKED", `Refusing to delete base branch: ${branchName}`)
      }
    }

    const removeArgs = ["worktree", "remove"]
    if (allowDirty) {
      removeArgs.push("--force")
    }
    removeArgs.push(targetPath)
    await runGit(baseWorkspacePath, removeArgs)

    if (deleteBranch && branchName) {
      await runGit(baseWorkspacePath, ["branch", "-D", branchName])
    }
  })
}
