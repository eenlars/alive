import * as path from "node:path"

/**
 * Checks if a resolved path is within workspace boundaries.
 * This is a critical security function to prevent path traversal attacks.
 *
 * @param resolvedPath - The resolved absolute path to check
 * @param workspaceRoot - The resolved workspace root
 * @returns true if path is within workspace
 * @example
 * const cwd = path.resolve(userProvidedCwd)
 * const root = '/srv/webalive/sites'
 * if (!isPathWithinWorkspace(cwd, root)) {
 *   throw new Error('Path traversal detected')
 * }
 */
export function isPathWithinWorkspace(resolvedPath: string, workspaceRoot: string): boolean {
  const separator = path.sep

  // Ensure both paths end with separator for proper comparison
  const normalizedWorkspace = workspaceRoot.endsWith(separator) ? workspaceRoot : workspaceRoot + separator
  const normalizedPath = resolvedPath.endsWith(separator) ? resolvedPath : resolvedPath + separator

  // Check if resolved path starts with workspace root
  return normalizedPath.startsWith(normalizedWorkspace) || resolvedPath === workspaceRoot
}

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

  if (!isPathWithinWorkspace(resolvedPath, resolvedWorkspace)) {
    return {
      valid: false,
      resolvedPath,
      error: "Path outside workspace",
    }
  }

  return { valid: true, resolvedPath }
}
