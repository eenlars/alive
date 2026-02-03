/**
 * Workspace and path validation guards
 * These guards prevent path traversal attacks and validate workspace constraints
 *
 * NOTE: All workspaces now use terminal mode (workspace specified in request body).
 * Domain-based workspace resolution has been removed.
 */

/**
 * Check if a workspace string is valid (not empty, is string type)
 */
export function isValidWorkspaceString(workspace: unknown): workspace is string {
  return typeof workspace === "string" && workspace.length > 0
}

/**
 * Check if a path is within workspace boundaries (prevents path traversal)
 * Both paths should be absolute/resolved
 */
export function isPathWithinWorkspace(normalizedPath: string, workspacePath: string, pathSeparator: string): boolean {
  return normalizedPath === workspacePath || normalizedPath.startsWith(workspacePath + pathSeparator)
}

/**
 * Check if path contains potential traversal attempts (..)
 */
export function containsPathTraversal(path: string): boolean {
  return path.includes("..")
}

/**
 * Check if path is a valid workspace pattern (e.g., webalive/sites/... or just site name)
 */
export function isValidWorkspacePath(workspace: string): boolean {
  return workspace.startsWith("webalive/sites/") || !workspace.includes("/")
}

/**
 * Validate workspace resolution result structure
 */
export function isWorkspaceResolved(result: unknown): result is { success: true; workspace: string } {
  if (typeof result !== "object" || result === null) return false
  const r = result as Record<string, unknown>
  return r.success === true && typeof r.workspace === "string"
}

/**
 * Check if workspace result has an error
 */
export function isWorkspaceError(result: unknown): result is { success: false; response: Response } {
  if (typeof result !== "object" || result === null) return false
  const r = result as Record<string, unknown>
  return r.success === false && r.response !== undefined
}
