import * as path from "node:path"

/**
 * Result of path validation
 */
export interface PathValidationResult {
  /** Whether the path is valid and safe */
  valid: boolean
  /** The resolved absolute path */
  resolvedPath: string
  /** Error message if validation failed */
  error?: string
}

/**
 * Resolves and validates that a path is within the workspace boundaries.
 * This is a critical security function to prevent path traversal attacks.
 *
 * @param targetPath - The user-provided path to validate
 * @param workspaceRoot - The workspace root directory
 * @returns Validation result with resolved path
 * @example
 * const result = resolveAndValidatePath('user/file.txt', '/srv/webalive/sites/example.com')
 * if (!result.valid) {
 *   throw new Error(result.error)
 * }
 * // Use result.resolvedPath safely
 */
export function resolveAndValidatePath(targetPath: string, workspaceRoot: string): PathValidationResult {
  const fullPath = path.join(workspaceRoot, targetPath)
  const resolvedPath = path.resolve(fullPath)
  const resolvedWorkspace = path.resolve(workspaceRoot)

  if (!isPathWithinWorkspace(resolvedPath, resolvedWorkspace, path.sep)) {
    return {
      valid: false,
      resolvedPath,
      error: "Path outside workspace",
    }
  }

  return { valid: true, resolvedPath }
}

/**
 * Result of path traversal detection
 */
export interface PathTraversalResult {
  /** Whether the path is safe (no traversal detected) */
  safe: boolean
  /** The normalized path */
  normalized: string
  /** Reason why the path was deemed unsafe */
  reason?: string
}

/**
 * Detects path traversal attempts in a given path.
 * Checks for ".." sequences and normalization changes.
 *
 * @param inputPath - The path to check for traversal attempts
 * @returns Detection result with normalized path
 * @example
 * const result = detectPathTraversal('../../../etc/passwd')
 * if (!result.safe) {
 *   console.error(result.reason)
 * }
 */
export function detectPathTraversal(inputPath: string): PathTraversalResult {
  const normalized = path.normalize(inputPath)

  if (normalized !== inputPath) {
    return {
      safe: false,
      normalized,
      reason: "Path normalization changed value",
    }
  }

  if (normalized.includes("..")) {
    return {
      safe: false,
      normalized,
      reason: "Contains parent directory references",
    }
  }

  return { safe: true, normalized }
}

/**
 * Checks if a path is within workspace boundaries.
 * This is an internal helper function used by resolveAndValidatePath.
 *
 * @param resolvedPath - The resolved absolute path to check
 * @param workspaceRoot - The resolved workspace root
 * @param separator - Path separator for the OS
 * @returns true if path is within workspace
 */
function isPathWithinWorkspace(resolvedPath: string, workspaceRoot: string, separator: string): boolean {
  // Ensure both paths end with separator for proper comparison
  const normalizedWorkspace = workspaceRoot.endsWith(separator) ? workspaceRoot : workspaceRoot + separator
  const normalizedPath = resolvedPath.endsWith(separator) ? resolvedPath : resolvedPath + separator

  // Check if resolved path starts with workspace root
  return normalizedPath.startsWith(normalizedWorkspace) || resolvedPath === workspaceRoot
}
