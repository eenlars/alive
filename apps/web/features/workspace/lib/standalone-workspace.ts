/**
 * Standalone workspace utilities
 * Manages local workspaces for standalone mode (no external dependencies)
 */

import { existsSync, mkdirSync, readdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { STANDALONE } from "@webalive/shared"

/**
 * Get the base directory for standalone workspaces
 * Uses WORKSPACE_BASE env var or defaults to ~/.claude-bridge/workspaces
 */
export function getStandaloneWorkspaceBase(): string {
  return process.env.WORKSPACE_BASE || join(homedir(), STANDALONE.DEFAULT_WORKSPACE_DIR)
}

/**
 * List all available local workspaces
 * Returns directory names (workspace names)
 */
export function getStandaloneWorkspaces(): string[] {
  const base = getStandaloneWorkspaceBase()
  if (!existsSync(base)) {
    return []
  }

  return readdirSync(base, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort()
}

/**
 * Validate standalone workspace name (single directory segment only)
 */
export function isValidStandaloneWorkspaceName(name: string): boolean {
  return Boolean(name) && !name.includes("..") && !name.includes("/") && !name.includes("\\")
}

/**
 * Get the full path to a workspace's user directory
 * @param name - Workspace name (directory name under base)
 */
export function getStandaloneWorkspacePath(name: string): string {
  if (!isValidStandaloneWorkspaceName(name)) {
    throw new Error(`Invalid workspace name: ${name}`)
  }
  const base = getStandaloneWorkspaceBase()
  return join(base, name, "user")
}

/**
 * Check if a standalone workspace exists
 */
export function standaloneWorkspaceExists(name: string): boolean {
  if (!isValidStandaloneWorkspaceName(name)) {
    return false
  }
  const path = getStandaloneWorkspacePath(name)
  return existsSync(path)
}

/**
 * Create a new standalone workspace
 * Creates the workspace directory structure: base/name/user
 * @returns The full path to the workspace's user directory
 */
export function createStandaloneWorkspace(name: string): string {
  // Validate workspace name (prevent path traversal)
  if (!isValidStandaloneWorkspaceName(name)) {
    throw new Error(`Invalid workspace name: ${name}`)
  }

  const path = getStandaloneWorkspacePath(name)
  mkdirSync(path, { recursive: true })
  return path
}

/**
 * Ensure the standalone workspace base directory exists
 * Called during setup
 */
export function ensureStandaloneWorkspaceBase(): string {
  const base = getStandaloneWorkspaceBase()
  if (!existsSync(base)) {
    mkdirSync(base, { recursive: true })
  }
  return base
}

/**
 * Create a default workspace if none exist
 */
export function ensureDefaultWorkspace(): void {
  const workspaces = getStandaloneWorkspaces()
  if (workspaces.length === 0) {
    createStandaloneWorkspace("default")
  }
}
