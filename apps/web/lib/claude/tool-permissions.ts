import type { Options } from "@anthropic-ai/claude-agent-sdk"
import { ensurePathWithinWorkspace, type Workspace } from "@/features/workspace/lib/workspace-secure"
import {
  ALLOWED_MCP_TOOLS as MCP_TOOLS_ARRAY,
  ALLOWED_SDK_TOOLS as SDK_TOOLS_ARRAY,
} from "@/lib/claude/agent-constants.mjs"

// Convert arrays to Sets for O(1) lookup performance
export const ALLOWED_SDK_TOOLS: Set<string> = new Set(SDK_TOOLS_ARRAY)
export const ALLOWED_MCP_TOOLS: Set<string> = new Set(MCP_TOOLS_ARRAY)

function extractFilePath(input: Record<string, unknown>): string | null {
  const filePathValue = input.file_path ?? input.path ?? input.notebook_path
  return typeof filePathValue === "string" ? filePathValue : null
}

function isToolPermitted(toolName: string): boolean {
  return ALLOWED_SDK_TOOLS.has(toolName) || ALLOWED_MCP_TOOLS.has(toolName)
}

/**
 * Permission handler for SDK tools
 *
 * Note: This handler is ONLY used for non-child-process workspaces (legacy root-owned sites).
 * All current systemd sites use child process isolation where:
 * - SDK tools (Write, Edit, Read, Glob, Grep) validate paths here
 * - MCP tools bypass this entirely (handled in child process with process.cwd())
 */
export function createToolPermissionHandler(
  workspace: Workspace,
  requestId: string,
): NonNullable<Options["canUseTool"]> {
  return async (toolName, input, _options) => {
    console.log(`[Request ${requestId}] Tool requested: ${toolName}`)

    if (!isToolPermitted(toolName)) {
      console.log(`[Request ${requestId}] Tool denied: ${toolName}`)
      return {
        behavior: "deny",
        message: `tool_not_allowed: ${toolName}`,
      }
    }

    // Validate file paths for SDK tools to prevent directory traversal
    if (ALLOWED_SDK_TOOLS.has(toolName)) {
      const filePath = extractFilePath(input)

      if (filePath) {
        try {
          ensurePathWithinWorkspace(filePath, workspace.root)
          console.log(`[Request ${requestId}] Path allowed: ${filePath}`)
        } catch {
          console.log(`[Request ${requestId}] Path outside workspace: ${filePath}`)
          return {
            behavior: "deny",
            message: "path_outside_workspace",
          }
        }
      }
    }

    console.log(`[Request ${requestId}] Tool allowed: ${toolName}`)
    return {
      behavior: "allow",
      updatedInput: input, // No modifications needed - child process handles workspace context
      updatedPermissions: [],
    }
  }
}
