import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { readServerLogs } from "../debug/read-server-logs.js"

/**
 * Composite tool: Reads logs with sensible defaults for debugging
 */

export const debugWorkspaceParamsSchema = {
  workspace: z
    .string()
    .min(1)
    .regex(/^[a-z0-9.-]+$/i)
    .describe("Workspace domain (e.g., 'two.sonno.tech')"),
  lines: z.number().int().min(1).max(1000).optional().default(200).describe("Log lines to analyze (default: 200)"),
  since: z.string().optional().describe('Time range (e.g., "5 minutes ago", "1 hour ago")'),
}

export type DebugWorkspaceParams = {
  workspace: string
  lines?: number
  since?: string
}

export type DebugWorkspaceResult = {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
}

export async function debugWorkspace(params: DebugWorkspaceParams): Promise<DebugWorkspaceResult> {
  const { workspace, lines = 200, since } = params

  // Just read the logs with sensible defaults
  return readServerLogs({
    workspace,
    lines,
    since: since || "10 minutes ago", // Default to recent logs only
  })
}

export const debugWorkspaceTool = tool(
  "debug_workspace",
  `Quick workspace debugging: reads recent server logs (last 10 minutes by default).

Use this FIRST when troubleshooting workspace issues. Returns raw logs for you to analyze.

Examples:
- debug_workspace({ workspace: "two.sonno.tech" })
- debug_workspace({ workspace: "demo.sonno.tech", since: "5 minutes ago" })`,
  debugWorkspaceParamsSchema,
  async args => {
    return debugWorkspace(args)
  },
)
