/**
 * GitHub Repository Import
 *
 * Downloads a GitHub repo via the API tarball endpoint, extracts it,
 * and restructures it to match the site template layout.
 *
 * Template layout:
 *   /package.json        (workspaces: ["user"], scripts delegate to user/)
 *   /scripts/            (empty dir - no generate-config.js)
 *   /user/               (repo files go here)
 */

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

const DOWNLOAD_TIMEOUT_MS = 60_000
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
  const input = repoUrl.trim()
  const invalidFormatMessage =
    `Invalid GitHub repo format: "${repoUrl}". ` +
    'Expected "https://github.com/owner/repo", "https://github.com/owner/repo.git", "git@github.com:owner/repo.git", or "owner/repo".'

  if (!input) {
    throw new Error(invalidFormatMessage)
  }

  const validName = (value: string) => /^[a-zA-Z0-9_.-]+$/.test(value)
  const normalizeRepo = (value: string) => value.replace(/\.git$/i, "")

  // SSH URL format: git@github.com:owner/repo(.git)
  const sshMatch = input.match(/^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/)
  if (sshMatch) {
    const owner = sshMatch[1]
    const repo = normalizeRepo(sshMatch[2] ?? "")
    if (!owner || !repo || !validName(owner) || !validName(repo)) {
      throw new Error(`Invalid GitHub URL: could not extract owner/repo from "${repoUrl}"`)
    }
    return { owner, repo }
  }

  // HTTPS URL format: https://github.com/owner/repo(.git)[/...]
  if (input.startsWith("https://")) {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(input)
    } catch {
      throw new Error(invalidFormatMessage)
    }

    if (parsedUrl.hostname.toLowerCase() !== "github.com") {
      throw new Error(invalidFormatMessage)
    }

    const pathnameParts = parsedUrl.pathname
      .split("/")
      .map(part => part.trim())
      .filter(Boolean)

    const owner = pathnameParts[0] ?? ""
    const repo = normalizeRepo(pathnameParts[1] ?? "")
    if (!owner || !repo || !validName(owner) || !validName(repo)) {
      throw new Error(`Invalid GitHub URL: could not extract owner/repo from "${repoUrl}"`)
    }

    return { owner, repo }
  }

  // owner/repo shorthand
  const shorthandMatch = input.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/)
  if (shorthandMatch) {
    const owner = shorthandMatch[1]
    const repo = normalizeRepo(shorthandMatch[2] ?? "")
    if (!owner || !repo) {
      throw new Error(`Invalid GitHub repo shorthand: could not extract owner/repo from "${repoUrl}"`)
    }
    return { owner, repo }
  }

  throw new Error(invalidFormatMessage)
}

/**
 * Download and extract a GitHub repository tarball via the API.
 *
 * Uses GET /repos/{owner}/{repo}/tarball/{ref} with Bearer token auth.
 * No git CLI required — pure HTTP + tar extraction.
 *
 * @param repoUrl - GitHub repo URL or owner/repo shorthand
 * @param githubToken - GitHub OAuth token (optional — public repos work without it)
 * @param branch - Optional branch/ref (defaults to repo default branch)
 * @returns Path to the extracted repo directory
 * @throws Error if download or extraction fails
 */
export async function downloadGithubRepo(repoUrl: string, githubToken?: string, branch?: string): Promise<string> {
  const { owner, repo } = parseGithubRepo(repoUrl)
  const ref = branch || ""
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/tarball/${ref}`

  const tempDir = `${GITHUB_IMPORT_PREFIX}${crypto.randomUUID()}`
  mkdirSync(tempDir, { recursive: true })

  const tarballPath = join(tempDir, "repo.tar.gz")
  const extractDir = join(tempDir, "extracted")
  mkdirSync(extractDir, { recursive: true })

  try {
    // Download tarball via GitHub API
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS)

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    }
    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`
    }

    const response = await fetch(apiUrl, {
      headers,
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const status = response.status
      if (status === 404) {
        throw new Error(
          `Repository ${owner}/${repo} not found. Check the name and ensure your GitHub account has access.`,
        )
      }
      if (status === 401 || status === 403) {
        if (githubToken) {
          throw new Error(
            `Access denied to ${owner}/${repo}. Reconnect your GitHub account in Settings > Integrations.`,
          )
        }
        throw new Error(
          `Cannot access ${owner}/${repo}. The repository may be private (connect your GitHub account in Settings > Integrations), or the unauthenticated API rate limit has been exceeded.`,
        )
      }
      throw new Error(`GitHub API returned ${status} for ${owner}/${repo}`)
    }

    // Write tarball to disk
    const arrayBuffer = await response.arrayBuffer()
    await Bun.write(tarballPath, arrayBuffer)

    // Extract tarball (tar is universally available, unlike git)
    execFileSync("tar", ["xzf", tarballPath, "-C", extractDir, "--strip-components=1"], {
      timeout: 30_000,
    })

    // The extracted files are now directly in extractDir
    const repoDir = join(tempDir, "repo")
    renameSync(extractDir, repoDir)

    if (!existsSync(repoDir) || readdirSync(repoDir).length === 0) {
      throw new Error(`Downloaded tarball was empty for ${owner}/${repo}`)
    }

    return repoDir
  } catch (error) {
    // Clean up on failure
    cleanupImportDir(tempDir)

    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s for ${owner}/${repo}`)
    }

    throw error
  }
}

/**
 * Restructure a downloaded repo directory into the site template layout.
 *
 * Moves repo files into a `user/` subdirectory and creates the root
 * package.json with workspace config (only if user/package.json exists).
 *
 * @param repoDir - Path to the repo files (e.g., /tmp/github-import-<uuid>/repo)
 * @returns Path to the prepared template directory (parent of repoDir)
 */
export function prepareImportedRepo(repoDir: string): string {
  // The template dir is the parent of the repo dir
  const templateDir = join(repoDir, "..")

  const userDir = join(templateDir, "user")

  // Move repo to user/ directory
  renameSync(repoDir, userDir)

  // Remove .git directory from user/ if present (shouldn't be with tarball, but safety)
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
  const resolved = resolve(tempDir)
  // Safety check: only remove directories under our known prefix
  if (!resolved.startsWith(GITHUB_IMPORT_PREFIX)) {
    throw new Error(`Refusing to remove directory outside of import prefix: ${tempDir}`)
  }

  if (existsSync(resolved)) {
    rmSync(resolved, { recursive: true, force: true })
  }
}

/**
 * Full import flow: download, restructure, return template path.
 *
 * The caller is responsible for calling cleanupImportDir() after deployment completes.
 *
 * @param repoUrl - GitHub repo URL or owner/repo shorthand
 * @param githubToken - GitHub OAuth token (optional — public repos work without it)
 * @param branch - Optional branch to download
 * @returns Object with templatePath and cleanupDir for post-deployment cleanup
 */
export async function importGithubRepo(
  repoUrl: string,
  githubToken?: string,
  branch?: string,
): Promise<{ templatePath: string; cleanupDir: string }> {
  const repoDir = await downloadGithubRepo(repoUrl, githubToken, branch)

  // The cleanup dir is the parent (the /tmp/github-import-<uuid>/ dir)
  const cleanupDir = join(repoDir, "..")

  try {
    const templatePath = prepareImportedRepo(repoDir)
    return { templatePath, cleanupDir }
  } catch (error) {
    // Clean up on preparation failure
    cleanupImportDir(cleanupDir)
    throw error
  }
}
