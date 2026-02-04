import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { callBridgeApi, errorResult, type ToolResult } from "../../lib/api-client.js"
import { extractDomainFromWorkspace } from "../../lib/workspace-validator.js"

export const deleteFileParamsSchema = {
  path: z.string().min(1).describe("Path to the file or directory to delete, relative to workspace root"),
  recursive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Required for deleting directories. Set to true to delete directory and all contents."),
}

export type DeleteFileParams = {
  path: string
  recursive?: boolean
}

/**
 * Delete a file or directory from the workspace.
 *
 * SECURITY MODEL (API Call Pattern):
 * - Uses API call to leverage centralized security checks
 * - API route validates:
 *   - Session authentication
 *   - Workspace authorization (user owns this workspace)
 *   - Path traversal protection
 *   - Protected files (index.ts, package.json, node_modules, .git)
 *   - Symlink escape prevention (TOCTOU)
 *   - Case-insensitive protected file check (macOS)
 */
export async function deleteFile(params: DeleteFileParams): Promise<ToolResult> {
  const { path, recursive = false } = params

  if (!path || path.trim() === "") {
    return errorResult("Invalid path", "Path cannot be empty")
  }

  // Security: Get workspace from process.cwd() set by Bridge
  const workspaceRoot = process.cwd()

  // Extract workspace domain from path using shared validator
  // This uses SECURITY.ALLOWED_WORKSPACE_BASES from config to support all allowed paths
  let workspace: string
  try {
    workspace = extractDomainFromWorkspace(workspaceRoot)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return errorResult("Invalid workspace configuration", message)
  }

  const response = await callBridgeApi({
    endpoint: "/api/files/delete",
    body: {
      path,
      recursive,
      workspace,
    },
  })

  // Format response for better UX
  if (!response.isError) {
    const successMsg = `✓ Deleted: ${path}${recursive ? " (recursive)" : ""}`
    console.error(`[delete_file] Success: ${successMsg}`)
    return {
      content: [{ type: "text", text: successMsg }],
      isError: false,
    }
  }

  console.error(`[delete_file] Error: ${JSON.stringify(response.content)}`)
  return response
}

export const deleteFileTool = tool(
  "delete_file",
  `Delete a file or directory from the workspace.

IMPORTANT RESTRICTIONS:
- Cannot delete protected files: index.ts, index.js, package.json, bun.lockb, tsconfig.json
- Cannot delete protected directories: node_modules, .git, .well-known
- Cannot delete files outside the workspace (path traversal blocked)
- Directories require recursive: true

Use this tool when the user asks to:
- Remove old/unused files
- Clean up temporary files
- Delete test files
- Remove deprecated code files

Examples:
- delete_file({ path: "old-component.tsx" })
- delete_file({ path: "temp/", recursive: true })
- delete_file({ path: "src/deprecated/utils.ts" })`,
  deleteFileParamsSchema,
  async args => {
    return deleteFile(args)
  },
)
