/**
 * Workspace Context Helpers for Child Process Agent
 *
 * Utilities for creating workspace contexts and permission handlers
 * that can inject workspace information into tool calls.
 *
 * Currently unused but preserved for potential future use cases:
 * - Custom MCP tools that need explicit workspace injection
 * - Non-MCP tools running in child process
 * - Testing scenarios
 */

/**
 * Create workspace context object from child process environment
 */
export function createWorkspaceContext(targetCwd, targetUid, targetGid) {
  return {
    root: targetCwd || process.cwd(),
    uid: targetUid,
    gid: targetGid,
    tenantId: targetCwd ? targetCwd.split("/").pop() : "unknown",
  }
}

/**
 * Create a permission handler that injects workspace context into all tool calls
 *
 * This was originally used to pass workspace info to MCP tools, but is no longer
 * needed since MCP tools can use process.cwd() directly after process.chdir().
 *
 * Preserved for potential future scenarios where explicit injection is needed.
 */
export function createWorkspacePermissionHandler(workspace) {
  return async (_toolName, input, _options) => {
    return {
      behavior: "allow",
      updatedInput: {
        ...input,
        __workspace: workspace,
      },
      updatedPermissions: [],
    }
  }
}
