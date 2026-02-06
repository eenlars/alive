import fs from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { WorktreeError, createWorktree, listWorktrees, removeWorktree, resolveWorktreePath } from "../worktrees"

// Mock runAsWorkspaceUser to work in test environment (root-owned temp dirs)
vi.mock("@/lib/workspace-execution/command-runner", () => ({
  runAsWorkspaceUser: async ({
    command,
    args,
    workspaceRoot,
    timeout,
  }: {
    command: string
    args: string[]
    workspaceRoot: string
    timeout?: number
  }) => {
    // In tests, just run the command directly without privilege dropping
    const result = spawnSync(command, args, {
      cwd: workspaceRoot,
      encoding: "utf8",
      timeout: timeout ?? 60000,
      env: sanitizedGitEnv(),
    })
    return {
      success: result.status === 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status,
    }
  },
}))

interface TestRepo {
  siteRoot: string
  baseWorkspacePath: string
}

function sanitizedGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.GIT_DIR
  delete env.GIT_WORK_TREE
  delete env.GIT_COMMON_DIR
  delete env.GIT_INDEX_FILE
  return env
}

function runGit(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: sanitizedGitEnv() })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
  }
  return result.stdout.trim()
}

function setupRepo(): TestRepo {
  const siteRoot = fs.mkdtempSync(path.join(tmpdir(), "worktree-site-"))
  const baseWorkspacePath = path.join(siteRoot, "user")
  fs.mkdirSync(baseWorkspacePath, { recursive: true })

  runGit(baseWorkspacePath, ["init", "-b", "main"])
  runGit(baseWorkspacePath, ["config", "user.email", "test@example.com"])
  runGit(baseWorkspacePath, ["config", "user.name", "Test User"])

  const readme = path.join(baseWorkspacePath, "README.md")
  fs.writeFileSync(readme, "hello")
  runGit(baseWorkspacePath, ["add", "."])
  runGit(baseWorkspacePath, ["commit", "-m", "init"])

  return { siteRoot, baseWorkspacePath }
}

function cleanupRepo(repo: TestRepo | null) {
  if (!repo) return
  if (fs.existsSync(repo.siteRoot)) {
    fs.rmSync(repo.siteRoot, { recursive: true, force: true })
  }
}

describe("worktrees service", () => {
  let repo: TestRepo | null = null

  beforeEach(() => {
    repo = setupRepo()
  })

  afterEach(() => {
    cleanupRepo(repo)
    repo = null
  })

  it("lists no worktrees when worktree root is missing", async () => {
    if (!repo) throw new Error("missing repo")
    const worktrees = await listWorktrees(repo.baseWorkspacePath)
    expect(worktrees).toEqual([])
  })

  it("creates and lists a worktree", async () => {
    if (!repo) throw new Error("missing repo")

    const result = await createWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "feature-a",
    })

    expect(result.slug).toBe("feature-a")
    expect(result.branch).toBe("worktree/feature-a")
    expect(fs.existsSync(result.worktreePath)).toBe(true)

    const worktrees = await listWorktrees(repo.baseWorkspacePath)
    expect(worktrees).toHaveLength(1)
    expect(worktrees[0].slug).toBe("feature-a")
    expect(worktrees[0].branch).toBe("worktree/feature-a")
  })

  it("resolves a worktree path and rejects traversal", async () => {
    if (!repo) throw new Error("missing repo")

    await createWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "feature-b",
    })

    const resolved = await resolveWorktreePath(repo.baseWorkspacePath, "feature-b")
    expect(resolved.endsWith(path.join("worktrees", "feature-b"))).toBe(true)

    await expect(resolveWorktreePath(repo.baseWorkspacePath, "../escape")).rejects.toMatchObject({
      code: "WORKTREE_INVALID_SLUG",
    })
  })

  it("rejects removal when worktree is dirty", async () => {
    if (!repo) throw new Error("missing repo")

    const { worktreePath } = await createWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "dirty-branch",
    })

    const dirtyFile = path.join(worktreePath, "dirty.txt")
    fs.writeFileSync(dirtyFile, "dirty")

    await expect(
      removeWorktree({
        baseWorkspacePath: repo.baseWorkspacePath,
        slug: "dirty-branch",
      }),
    ).rejects.toMatchObject({ code: "WORKTREE_DIRTY" })
  })

  it("removes worktree and deletes branch", async () => {
    if (!repo) throw new Error("missing repo")

    await createWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "cleanup-branch",
    })

    await removeWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "cleanup-branch",
      deleteBranch: true,
      allowDirty: true,
    })

    const branchCheck = spawnSync(
      "git",
      ["-C", repo.baseWorkspacePath, "rev-parse", "--verify", "refs/heads/worktree/cleanup-branch"],
      { encoding: "utf8", env: sanitizedGitEnv() },
    )

    expect(branchCheck.status).not.toBe(0)
  })

  it("throws consistent error codes for invalid slug", async () => {
    if (!repo) throw new Error("missing repo")

    let error: unknown = null
    try {
      await createWorktree({
        baseWorkspacePath: repo.baseWorkspacePath,
        slug: "bad/slug",
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(WorktreeError)
    expect((error as WorktreeError).code).toBe("WORKTREE_INVALID_SLUG")
  })

  it("rejects create when worktree lock is held", async () => {
    if (!repo) throw new Error("missing repo")

    const lockPath = path.join(repo.baseWorkspacePath, ".git", "bridge-worktree.lock")
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 123, at: new Date().toISOString() }))

    await expect(
      createWorktree({
        baseWorkspacePath: repo.baseWorkspacePath,
        slug: "locked-branch",
      }),
    ).rejects.toMatchObject({ code: "WORKTREE_LOCKED" })
  })

  it("rejects invalid branch names", async () => {
    if (!repo) throw new Error("missing repo")

    await expect(
      createWorktree({
        baseWorkspacePath: repo.baseWorkspacePath,
        slug: "bad-branch",
        branch: "bad branch",
      }),
    ).rejects.toMatchObject({ code: "WORKTREE_INVALID_BRANCH" })
  })

  it("rejects invalid base ref", async () => {
    if (!repo) throw new Error("missing repo")

    await expect(
      createWorktree({
        baseWorkspacePath: repo.baseWorkspacePath,
        slug: "bad-from",
        from: "does-not-exist",
      }),
    ).rejects.toMatchObject({ code: "WORKTREE_INVALID_FROM" })
  })

  it("returns a clear error when base workspace is not a git repo", async () => {
    if (!repo) throw new Error("missing repo")

    const gitDir = path.join(repo.baseWorkspacePath, ".git")
    if (fs.existsSync(gitDir)) {
      fs.rmSync(gitDir, { recursive: true, force: true })
    }

    await expect(listWorktrees(repo.baseWorkspacePath)).rejects.toMatchObject({ code: "WORKTREE_NOT_GIT" })
  })

  it("rejects worktree creation when base path is itself a worktree", async () => {
    if (!repo) throw new Error("missing repo")

    const { worktreePath } = await createWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "nested-base",
    })

    await expect(
      createWorktree({
        baseWorkspacePath: worktreePath,
        slug: "nested-attempt",
      }),
    ).rejects.toMatchObject({ code: "WORKTREE_BASE_INVALID" })
  })

  it("rejects create when branch is already checked out by another worktree", async () => {
    if (!repo) throw new Error("missing repo")

    const first = await createWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "branch-in-use",
    })

    await expect(
      createWorktree({
        baseWorkspacePath: repo.baseWorkspacePath,
        slug: "branch-in-use-2",
        branch: first.branch,
      }),
    ).rejects.toMatchObject({ code: "WORKTREE_BRANCH_IN_USE" })
  })

  it("auto-suffixes when default branch already exists", async () => {
    if (!repo) throw new Error("missing repo")

    runGit(repo.baseWorkspacePath, ["branch", "worktree/suffix-test"])

    const created = await createWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "suffix-test",
    })

    expect(created.branch).toMatch(/^worktree\/suffix-test-/)

    await removeWorktree({
      baseWorkspacePath: repo.baseWorkspacePath,
      slug: "suffix-test",
      allowDirty: true,
    })
  })
})
