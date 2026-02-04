import { tool } from "@anthropic-ai/claude-agent-sdk"
import { truncateOutput } from "@webalive/shared"
import { z } from "zod"
import { callBridgeApi } from "../../lib/api-client.js"

export const readServerLogsParamsSchema = {
  workspace: z
    .string()
    .min(1)
    .regex(/^[a-z0-9.-]+$/i, "Workspace must be a valid domain (e.g., two.goalive.nl)")
    .describe("Workspace domain (e.g., 'two.goalive.nl')"),
  search: z.string().optional().describe('Filter logs by search term (e.g., "error", "warning", "vite")'),
  search_regex: z
    .string()
    .optional()
    .describe(
      'Advanced: Filter logs using regex pattern (e.g., "error|warn", "failed.*build", "\\d{3}\\s*error"). More powerful than basic search.',
    ),
  lines: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .default(100)
    .describe("Number of log lines to retrieve (default: 100, max: 1000)"),
  since: z.string().optional().describe('Time range (e.g., "5 minutes ago", "1 hour ago", "today")'),
}

export type ReadServerLogsParams = {
  workspace: string
  search?: string
  search_regex?: string
  lines?: number
  since?: string
}

export type ReadServerLogsResult = {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
}

function sanitizeSearchTerm(search: string): string {
  return search.replace(/[;&|`$()<>]/g, "")
}

export async function readServerLogs(params: ReadServerLogsParams): Promise<ReadServerLogsResult> {
  const { workspace, search, search_regex, lines = 100, since } = params

  try {
    // Call Bridge API to read logs (runs as root with proper privileges)
    const apiResult = await callBridgeApi({
      endpoint: "/api/internal-tools/read-logs",
      body: {
        workspace,
        lines,
        since,
        workspaceRoot: process.cwd(), // Required for auth validation
      },
      timeout: 15000,
    })

    // If API call failed, return the error
    if (apiResult.isError) {
      return apiResult
    }

    // Parse API response (output field contains JSON string with logs data)
    const apiResponse = JSON.parse(apiResult.content[0].text)
    const { logs: stdout, service: serviceName, status: serviceStatus } = apiResponse

    if (!stdout || stdout.trim() === "") {
      return {
        content: [
          {
            type: "text" as const,
            text: `# No Logs Available\n\n**Workspace:** ${workspace}\n**Service:** ${serviceName}\n**Status:** ${serviceStatus}\n\nThe service exists but has no logs yet.\n\n**Possible reasons:**\n- Service just started\n- Service hasn't generated any output\n- Logs may have been rotated\n\n**Try:**\n- Use a longer time range: \`since: "1 hour ago"\`\n- Check service status: \`systemctl status ${serviceName}\``,
          },
        ],
        isError: false,
      }
    }

    // Apply filtering if requested
    let logs = stdout
    if (search_regex) {
      try {
        const regex = new RegExp(search_regex, "i")
        logs = stdout
          .split("\n")
          .filter((line: string) => regex.test(line))
          .join("\n")
      } catch (_regexError) {
        console.warn(`[read-server-logs] Invalid regex pattern: ${search_regex}, ignoring`)
      }
    } else if (search) {
      const searchLower = sanitizeSearchTerm(search).toLowerCase()
      logs = stdout
        .split("\n")
        .filter((line: string) => line.toLowerCase().includes(searchLower))
        .join("\n")
    }

    if (!logs || logs.trim() === "") {
      return {
        content: [
          {
            type: "text" as const,
            text: `# No Matching Logs\n\n**Workspace:** ${workspace}\n**${search_regex ? `Regex: \`${search_regex}\`` : search ? `Search: "${search}"` : ""}\n\nNo logs matched your filter.\n\n**Try:**\n- Different search term\n- Remove the search filter\n- Expand time range with \`since\` parameter`,
          },
        ],
        isError: false,
      }
    }

    let output = `# Server Logs: ${workspace}\n\n`
    output += `**Service:** ${serviceName}\n`
    output += `**Status:** ${serviceStatus}\n`
    output += `**Lines:** ${lines}\n`
    if (search_regex) {
      output += `**Filtered by regex:** \`${search_regex}\`\n`
    } else if (search) {
      output += `**Filtered by:** "${search}"\n`
    }
    if (since) {
      output += `**Time range:** ${since}\n`
    }
    output += "\n---\n\n"
    output += "```\n"
    output += logs
    output += "\n```\n"

    return {
      content: [
        {
          type: "text" as const,
          text: truncateOutput(output),
        },
      ],
      isError: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error("[read-server-logs] Error:", error)

    let troubleshooting = "\n\n**Troubleshooting:**"
    if (errorMessage.includes("timeout")) {
      troubleshooting += "\n- The API request timed out (>15 seconds)"
      troubleshooting += "\n- Try reducing the number of lines or time range"
    } else if (errorMessage.includes("JSON") || errorMessage.includes("parse")) {
      troubleshooting += "\n- Failed to parse API response"
      troubleshooting += "\n- This may indicate a server error"
    } else {
      troubleshooting += `\n- ${errorMessage}`
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `# Failed to Read Server Logs\n\n**Workspace:** ${params.workspace}\n\n**Error:** ${errorMessage}${troubleshooting}`,
        },
      ],
      isError: true,
    }
  }
}

export const readServerLogsTool = tool(
  "read_server_logs",
  `Reads systemd journal logs from a workspace's dev server. Returns raw log lines for you to analyze.

Use this FIRST when debugging to see actual dev server errors.

Examples:
- read_server_logs({ workspace: "two.goalive.nl" })
- read_server_logs({ workspace: "demo.goalive.nl", search: "error" })
- read_server_logs({ workspace: "mysite.com", search_regex: "error|fail|exception" })
- read_server_logs({ workspace: "site.com", lines: 200, since: "1 hour ago" })`,
  readServerLogsParamsSchema,
  async args => {
    return readServerLogs(args)
  },
)
