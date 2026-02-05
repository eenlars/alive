/**
 * Workspace Validation for MCP Tools
 *
 * Ensures tools can only operate on allowed workspace paths.
 * Critical security boundary - prevents path traversal attacks.
 */

import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { SECURITY } from "@webalive/shared"

const ALLOWED_WORKSPACE_BASES = SECURITY.ALLOWED_WORKSPACE_BASES

/**
 * Validates that a workspace path is within allowed boundaries
 *
 * @throws Error if path is invalid or outside allowed workspaces
 */
export function validateWorkspacePath(workspaceRoot: string): void {
  // Normalize and resolve path (handles .., symlinks, etc.)
  const resolvedPath = resolve(workspaceRoot)

  // Check if path is within any allowed base (must be subdirectory or exact match)
  const isAllowed = ALLOWED_WORKSPACE_BASES.some(base => {
    // Path must start with base and either be exact match or have / after base
    return resolvedPath === base || resolvedPath.startsWith(`${base}/`)
  })

  if (!isAllowed) {
    throw new Error(
      `Invalid workspace path. Must be within: ${ALLOWED_WORKSPACE_BASES.join(" or ")}\nProvided: ${resolvedPath}`,
    )
  }

  // Verify path exists
  if (!existsSync(resolvedPath)) {
    throw new Error(`Workspace path does not exist: ${resolvedPath}`)
  }
}

/**
 * Checks if workspace has a package.json (is a Node.js project)
 */
export function hasPackageJson(workspaceRoot: string): boolean {
  return existsSync(resolve(workspaceRoot, "package.json"))
}

/**
 * Extracts the domain from a workspace path.
 *
 * Uses the allowed workspace bases from configuration to locate the "sites" segment,
 * then returns the next path component as the domain.
 *
 * @example
 * extractDomainFromWorkspace("/srv/webalive/sites/example.com/user") // "example.com"
 * extractDomainFromWorkspace("/srv/webalive/sites/test.com/user")   // "test.com"
 *
 * @throws Error if the path is not within an allowed workspace base or domain cannot be extracted
 */
export function extractDomainFromWorkspace(workspaceRoot: string): string {
  const resolvedPath = resolve(workspaceRoot)

  // Find matching allowed base
  const matchedBase = ALLOWED_WORKSPACE_BASES.find(base => resolvedPath === base || resolvedPath.startsWith(`${base}/`))

  if (!matchedBase) {
    throw new Error(
      "Cannot extract domain: path is not within allowed workspace bases.\n" +
        `Allowed: ${ALLOWED_WORKSPACE_BASES.join(", ")}\n` +
        `Provided: ${resolvedPath}`,
    )
  }

  // Extract the path after the base
  // e.g., "/srv/webalive/sites/example.com/user" -> "example.com/user"
  const relativePath = resolvedPath.slice(matchedBase.length + 1) // +1 to skip the trailing slash

  if (!relativePath) {
    throw new Error(
      "Cannot extract domain: path is exactly the base directory.\n" +
        `Base: ${matchedBase}\n` +
        `Expected format: ${matchedBase}/[domain]/...`,
    )
  }

  // Extract the first path segment (the domain)
  const firstSlash = relativePath.indexOf("/")
  const domain = firstSlash === -1 ? relativePath : relativePath.slice(0, firstSlash)

  if (!domain) {
    throw new Error(
      "Cannot extract domain from workspace path.\n" +
        `Path: ${resolvedPath}\n` +
        `Expected format: ${matchedBase}/[domain]/...`,
    )
  }

  return domain
}
