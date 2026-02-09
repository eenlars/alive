/**
 * GitHub Repository Import
 *
 * Clones a GitHub repo, restructures it to match the site template layout,
 * and returns the path to use as templatePath for deploySite().
 *
 * Template layout:
 *   /package.json        (workspaces: ["user"], scripts delegate to user/)
 *   /scripts/            (empty dir - no generate-config.js)
 *   /user/               (repo files go here)
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const CLONE_TIMEOUT_MS = 60_000
const GITHUB_IMPORT_PREFIX = "/tmp/github-import-"

/**
 * Parsed GitHub repository reference
 */
interface ParsedRepo {
  owner: string
  repo: string
}

/**
 * Parse a GitHub repo URL or shorthand into owner/repo.
 *
 * Supported formats:
 *   - https://github.com/owner/repo
 *   - https://github.com/owner/repo.git
 *   - owner/repo
 *
 * @throws Error if the format is not recognized
 */
export function parseGithubRepo(repoUrl: string): ParsedRepo {
  // Try HTTPS URL format
  const httpsMatch = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/)
  if (httpsMatch) {
    const owner = httpsMatch[1]
    const repo = httpsMatch[2]
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub URL: could not extract owner/repo from "${repoUrl}"`)
    }
    return { owner, repo }
  }

  // Try owner/repo shorthand
  const shorthandMatch = repoUrl.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/)
  if (shorthandMatch) {
    const owner = shorthandMatch[1]
    const repo = shorthandMatch[2]
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub repo shorthand: could not extract owner/repo from "${repoUrl}"`)
    }
    return { owner, repo }
  }

  throw new Error(
    `Invalid GitHub repo format: "${repoUrl}". ` +
      'Expected "https://github.com/owner/repo", "https://github.com/owner/repo.git", or "owner/repo".',
  )
}

/**
 * Clone a GitHub repository to a temporary directory.
 *
 * @param repoUrl - GitHub repo URL or owner/repo shorthand
 * @param githubToken - Optional PAT for private repos
 * @param branch - Optional branch to clone (defaults to repo default branch)
 * @returns Path to the cloned repo directory
 * @throws Error if clone fails or times out
 */
export function cloneGithubRepo(repoUrl: string, githubToken: string | null, branch?: string): string {
  const { owner, repo } = parseGithubRepo(repoUrl)

  const tempDir = `${GITHUB_IMPORT_PREFIX}${crypto.randomUUID()}`
  mkdirSync(tempDir, { recursive: true })

  const cloneUrl = githubToken
    ? `https://${githubToken}@github.com/${owner}/${repo}.git`
    : `https://github.com/${owner}/${repo}.git`

  const branchArgs = branch ? `--branch ${branch}` : ""
  const cloneCmd = `git clone --depth 1 ${branchArgs} ${cloneUrl} ${tempDir}/repo`

  try {
    execSync(cloneCmd, {
      timeout: CLONE_TIMEOUT_MS,
      stdio: "pipe", // suppress output (token in URL)
    })
  } catch (error: unknown) {
    // Clean up on failure
    cleanupImportDir(tempDir)

    if (error instanceof Error && "killed" in error && error.killed) {
      throw new Error(`Git clone timed out after ${CLONE_TIMEOUT_MS / 1000} seconds for ${owner}/${repo}`)
    }

    // Sanitize error message to avoid leaking tokens
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : ""
    const sanitizedStderr = stderr.replace(/https:\/\/[^@]+@/g, "https://***@")

    throw new Error(`Git clone failed for ${owner}/${repo}: ${sanitizedStderr}`)
  }

  const clonedDir = join(tempDir, "repo")
  if (!existsSync(clonedDir)) {
    cleanupImportDir(tempDir)
    throw new Error(`Git clone produced no output directory for ${owner}/${repo}`)
  }

  return clonedDir
}

/**
 * Restructure a cloned repo directory into the site template layout.
 *
 * Moves repo files into a `user/` subdirectory and creates the root
 * package.json with workspace config (only if user/package.json exists).
 *
 * @param clonedDir - Path to the cloned repo (e.g., /tmp/github-import-<uuid>/repo)
 * @returns Path to the prepared template directory (parent of clonedDir)
 */
export function prepareImportedRepo(clonedDir: string): string {
  // The template dir is the parent of the cloned repo dir
  const templateDir = join(clonedDir, "..")

  const userDir = join(templateDir, "user")

  // Move cloned repo to user/ directory
  // First, rename the cloned dir to user/
  renameSync(clonedDir, userDir)

  // Remove .git directory from user/ (not needed for deployment)
  const gitDir = join(userDir, ".git")
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true, force: true })
  }

  // Check if user/package.json exists to decide on root package.json
  const userPackageJsonPath = join(userDir, "package.json")
  const hasUserPackageJson = existsSync(userPackageJsonPath)

  if (hasUserPackageJson) {
    // Create root package.json that delegates to user/
    const rootPackageJson = {
      name: "@webalive/imported-site",
      version: "0.0.0",
      private: true,
      workspaces: ["user"],
      scripts: {
        dev: "cd user && bun run dev",
        build: "cd user && bun run build",
        preview: "cd user && bun run preview",
      },
    }

    writeFileSync(join(templateDir, "package.json"), `${JSON.stringify(rootPackageJson, null, 2)}\n`)
  }

  // Create empty scripts/ dir (no generate-config.js, so build script skips vite config generation)
  const scriptsDir = join(templateDir, "scripts")
  mkdirSync(scriptsDir, { recursive: true })

  return templateDir
}

/**
 * Clean up a temporary import directory.
 *
 * @param tempDir - Path to the temp directory to remove
 */
export function cleanupImportDir(tempDir: string): void {
  // Safety check: only remove directories under our known prefix
  if (!tempDir.startsWith(GITHUB_IMPORT_PREFIX)) {
    throw new Error(`Refusing to remove directory outside of import prefix: ${tempDir}`)
  }

  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

/**
 * Full import flow: clone, restructure, return template path.
 *
 * The caller is responsible for calling cleanupImportDir() after deploySite() completes.
 *
 * @param repoUrl - GitHub repo URL or owner/repo shorthand
 * @param githubToken - Optional PAT for private repos
 * @param branch - Optional branch to clone
 * @returns Object with templatePath and cleanupDir for post-deployment cleanup
 */
export function importGithubRepo(
  repoUrl: string,
  githubToken: string | null,
  branch?: string,
): { templatePath: string; cleanupDir: string } {
  const clonedDir = cloneGithubRepo(repoUrl, githubToken, branch)

  // The cleanup dir is the parent (the /tmp/github-import-<uuid>/ dir)
  const cleanupDir = join(clonedDir, "..")

  try {
    const templatePath = prepareImportedRepo(clonedDir)
    return { templatePath, cleanupDir }
  } catch (error) {
    // Clean up on preparation failure
    cleanupImportDir(cleanupDir)
    throw error
  }
}
