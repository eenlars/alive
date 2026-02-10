/**
 * Website Backup Orchestration
 *
 * Coordinates backup of all websites to GitHub:
 * - Fetches latest changes from remote
 * - Detects changes across sites
 * - Filters sites by file count
 * - Stages and commits changes
 * - Pushes to GitHub repository
 */

import { spawnSync } from "node:child_process"
import { PATHS } from "@webalive/shared"
import { DeploymentError } from "./errors.js"

// Configuration
const REPO_DIR = PATHS.BACKUP_REPO
const SSH_KEY = "/root/.ssh/id_lars_deploy_bot"
const MAX_FILES_PER_SITE = 200

interface BackupStats {
  stagedFiles: number
  includedSites: string[]
  skippedSites: string[]
  timestamp: string
}

/**
 * Execute git command with SSH key configured
 */
function gitExec(args: string[], cwd: string = REPO_DIR): string {
  try {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf-8",
      env: {
        ...process.env,
        GIT_SSH_COMMAND: `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no`,
      },
    })

    if (result.error) {
      throw result.error
    }

    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `Command exited with status ${result.status}`)
    }

    return result.stdout.trim()
  } catch (error) {
    throw DeploymentError.generic(`Git command failed: ${error}`)
  }
}

/**
 * Fetch latest changes from remote
 */
function fetchLatest(): void {
  console.log("[Backup] Fetching latest changes from remote...")
  try {
    gitExec(["fetch", "origin", "main"])
  } catch (error) {
    throw DeploymentError.generic(`Failed to fetch from remote: ${error}`)
  }
}

/**
 * Check if local branch is behind remote and pull if needed
 */
function pullIfBehind(): void {
  try {
    const local = gitExec(["rev-parse", "HEAD"])
    const remote = gitExec(["rev-parse", "origin/main"])

    if (local !== remote) {
      console.log("[Backup] Local branch differs from remote. Pulling changes...")
      gitExec(["pull", "origin", "main", "--no-rebase"])
    }
  } catch (error) {
    throw DeploymentError.generic(`Failed to sync with remote: ${error}`)
  }
}

/**
 * Detect if there are any changes in the repository
 */
function hasChanges(): boolean {
  try {
    const status = gitExec(["status", "--porcelain"])
    return status.length > 0
  } catch (error) {
    throw DeploymentError.generic(`Failed to check repository status: ${error}`)
  }
}

/**
 * Parse git status output and count files per site
 */
function analyzeSites(): {
  includedSites: string[]
  skippedSites: string[]
  fileCounts: Record<string, number>
} {
  console.log("[Backup] Analyzing sites...")

  const status = gitExec(["status", "--porcelain"])
  const includedSites: string[] = []
  const skippedSites: string[] = []
  const fileCounts: Record<string, number> = {}

  // Parse each line and count files per site
  for (const line of status.split("\n")) {
    if (!line.trim()) continue

    const file = line.substring(3).trim()
    // Match both 'sites/name/' (files in dir) and 'sites/name' (untracked dir)
    const siteMatch = file.match(/^sites\/([^/]+)(\/|$)/)

    if (!siteMatch) {
      // Non-site files are always included
      continue
    }

    const site = siteMatch[1]
    fileCounts[site] = (fileCounts[site] || 0) + 1
  }

  // Categorize sites
  for (const [site, count] of Object.entries(fileCounts)) {
    if (count > MAX_FILES_PER_SITE) {
      skippedSites.push(site)
      console.log(`[Backup] ✗ Skipping sites/${site}/ (${count} files > ${MAX_FILES_PER_SITE})`)
    } else {
      includedSites.push(site)
      console.log(`[Backup] ✓ Including sites/${site}/ (${count} files)`)
    }
  }

  if (includedSites.length === 0 && skippedSites.length > 0) {
    throw DeploymentError.generic("No sites to backup after filtering")
  }

  return { includedSites, skippedSites, fileCounts }
}

/**
 * Stage files for commit, excluding build artifacts
 */
function stageFiles(includedSites: string[]): number {
  console.log("[Backup] Staging files...")

  // Stage files from included sites
  for (const site of includedSites) {
    try {
      gitExec(["add", "-A", `sites/${site}/`], REPO_DIR)
      // Remove build artifacts if accidentally added
      gitExec(
        [
          "reset",
          `sites/${site}/node_modules`,
          `sites/${site}/**/.vite`,
          `sites/${site}/**/dist`,
          `sites/${site}/**/build`,
          `sites/${site}/**/.bun`,
        ],
        REPO_DIR,
      )
    } catch (_error) {
      // Don't fail if reset fails (patterns might not match)
      console.log(`[Backup] Reset artifacts for ${site} (may not exist)`)
    }
  }

  // Stage non-site files (storage, configs, etc)
  const status = gitExec(["status", "--porcelain"])
  for (const line of status.split("\n")) {
    if (!line.trim()) continue

    const file = line.substring(3).trim()
    if (!file.startsWith("sites/")) {
      try {
        gitExec(["add", file], REPO_DIR)
      } catch {
        // Ignore errors on individual files
      }
    }

    // Handle deleted files
    if (line.startsWith(" D ")) {
      try {
        gitExec(["rm", file], REPO_DIR)
      } catch {
        // Ignore errors
      }
    }
  }

  // Count staged files
  const stagedFiles = gitExec(["diff", "--cached", "--name-only"])
    .split("\n")
    .filter(f => f.trim()).length

  console.log(`[Backup] Total files staged: ${stagedFiles}`)
  return stagedFiles
}

/**
 * Create commit with timestamp and site information
 */
function createCommit(skippedSites: string[]): void {
  const timestamp = new Date().toISOString().split("T")[0]
  let commitMsg = `Backup: ${timestamp}\n\nAutomated backup of all websites from /srv/webalive`

  if (skippedSites.length > 0) {
    commitMsg += `\n\nSkipped sites with >${MAX_FILES_PER_SITE} files:`
    for (const site of skippedSites) {
      commitMsg += `\n  - ${site}`
    }
  }

  commitMsg += "\n\nCo-Authored-By: lars-deploy-bot <lars-deploy-bot@hetzner-webalive>"

  console.log("[Backup] Creating commit...")
  try {
    gitExec(["commit", "-m", commitMsg], REPO_DIR)
  } catch (error) {
    throw DeploymentError.generic(`Failed to create commit: ${error}`)
  }
}

/**
 * Push changes to GitHub
 */
function pushToGitHub(): void {
  console.log("[Backup] Pushing to GitHub...")
  try {
    gitExec(["push", "origin", "main"], REPO_DIR)
  } catch (error) {
    throw DeploymentError.generic(`Failed to push to GitHub: ${error}`)
  }
}

/**
 * Orchestrate full website backup process
 */
export async function backupWebsites(): Promise<BackupStats> {
  const timestamp = new Date().toISOString()

  try {
    console.log("[Backup] Starting website backup")
    console.log(`[Backup] Timestamp: ${timestamp}`)

    // 1. Fetch latest from remote
    fetchLatest()

    // 2. Pull if behind
    pullIfBehind()

    // 3. Check if there are changes
    if (!hasChanges()) {
      console.log("[Backup] No changes detected. Repository is up to date.")
      return {
        stagedFiles: 0,
        includedSites: [],
        skippedSites: [],
        timestamp,
      }
    }

    // 4. Analyze sites and filter by file count
    const { includedSites, skippedSites } = analyzeSites()

    // 5. Stage files
    const stagedFiles = stageFiles(includedSites)

    // 6. If no files staged, return early (nothing to commit)
    if (stagedFiles === 0) {
      console.log("[Backup] No files to commit after staging. Repository is up to date.")
      return {
        stagedFiles: 0,
        includedSites: [],
        skippedSites,
        timestamp,
      }
    }

    // 7. Create commit
    createCommit(skippedSites)

    // 8. Push to GitHub
    pushToGitHub()

    console.log("[Backup] ✓ Backup completed successfully!")
    console.log(`[Backup] ✓ ${stagedFiles} files pushed to GitHub`)

    if (skippedSites.length > 0) {
      console.log(`[Backup] ⚠ ${skippedSites.length} site(s) skipped (too many files)`)
    }

    return {
      stagedFiles,
      includedSites,
      skippedSites,
      timestamp,
    }
  } catch (error) {
    console.error("[Backup] Backup failed:", error)
    throw error instanceof DeploymentError ? error : DeploymentError.generic(`Backup failed: ${error}`)
  }
}
