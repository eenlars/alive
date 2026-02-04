import { tool } from "@anthropic-ai/claude-agent-sdk"
import { callBridgeApi, type ToolResult } from "../../lib/api-client.js"

export const restartServerParamsSchema = {}

export type RestartServerParams = Record<string, never>

/**
 * Restart the workspace's systemd dev server.
 *
 * SECURITY MODEL (API Call Pattern):
 * - Uses API call because systemctl requires root privileges
 * - Child process runs as workspace user (after setuid) - cannot execute systemctl
 * - API route runs in parent process (as root) with full privilege
 * - API route validates workspace authorization before executing systemctl
 *
 * This is the EXCEPTION pattern - only used when root privileges required.
 * Most workspace tools should use direct execution (see install-package.ts).
 */
export async function restartServer(_params: RestartServerParams): Promise<ToolResult> {
  // Security: Use process.cwd() set by Bridge - never accept workspace from user
  const workspaceRoot = process.cwd()

  // callBridgeApi automatically validates workspaceRoot and includes session cookie
  const result = await callBridgeApi({
    endpoint: "/api/restart-workspace",
    body: { workspaceRoot },
  })

  // The API now returns mode info - pass through the improved message
  return result
}

export const restartServerTool = tool(
  "restart_dev_server",
  "Clears the Vite dependency cache and restarts the systemd dev server for the current workspace. Use this after: adding new dependencies, encountering component rendering issues, making structural changes, or when UI components appear to work structurally but don't respond to interactions. This fixes stale Vite cache issues that can cause mysterious 'renders but doesn't work' problems.",
  restartServerParamsSchema,
  async args => {
    return restartServer(args)
  },
)
