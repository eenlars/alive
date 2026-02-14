import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import {
  DETAIL_LEVELS,
  type DetailLevel,
  getSearchToolRegistry,
  TOOL_CATEGORIES,
  type ToolCategory,
} from "./tool-registry.js"

export const searchToolsParamsSchema = {
  category: z
    .enum(TOOL_CATEGORIES)
    .describe(
      `Category to search. Options: ${TOOL_CATEGORIES.join(", ")}. E.g., "documentation", "debugging", "workspace"`,
    ),
  detail_level: z
    .enum(DETAIL_LEVELS)
    .optional()
    .default("standard")
    .describe(
      "'minimal' (names only), 'standard' (names + descriptions), 'full' (complete parameter schemas). Default: 'standard'",
    ),
}

export type SearchToolsParams = {
  category: ToolCategory
  detail_level?: DetailLevel
}

export type SearchToolsResult = {
  content: Array<{ type: "text"; text: string }>
  isError: boolean
}

let connectedOAuthProviders: string[] = []

/**
 * Sets connected OAuth providers for runtime tool discovery filtering.
 * Called by stream runners before each query.
 */
export function setSearchToolsConnectedProviders(providers: string[]): void {
  connectedOAuthProviders = providers
}

export async function searchTools(params: SearchToolsParams): Promise<SearchToolsResult> {
  const { category, detail_level = "standard" } = params

  try {
    // Filter by category (required parameter)
    const tools = getSearchToolRegistry(connectedOAuthProviders).filter(t => t.category === category)

    if (tools.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `# No Tools Found\n\nCategory: "${category}"\n\nNo tools found in this category.`,
          },
        ],
        isError: false,
      }
    }

    // Format based on detail level
    let output = `# Tools in "${category}" (${tools.length})\n\n`

    for (const tool of tools) {
      if (detail_level === "minimal") {
        // Just name
        output += `- **${tool.name}**\n`
      } else if (detail_level === "standard") {
        // Name + description + context cost
        output += `### ${tool.name}\n`
        output += `${tool.description}\n`
        output += `- **Context cost:** ${tool.contextCost}\n\n`
      } else {
        // Full schema
        output += `### ${tool.name}\n`
        output += `${tool.description}\n\n`
        output += `- **Context cost:** ${tool.contextCost}\n`

        if (tool.parameters && tool.parameters.length > 0) {
          output += "- **Parameters:**\n"
          for (const param of tool.parameters) {
            output += `  - \`${param.name}\` (${param.type}${param.required ? ", required" : ", optional"}): ${param.description}\n`
          }
        }
        output += "\n"
      }
    }

    output += "\n---\n\n"
    output += "**Progressive disclosure best practice:**\n"
    output += "- Use `detail_level: 'minimal'` to discover available tools (lowest context cost)\n"
    output += "- Use `detail_level: 'standard'` to see descriptions and context costs\n"
    output += "- Use `detail_level: 'full'` only when you need complete parameter schemas\n"
    output += "\n**Context efficiency tips:**\n"
    output += "- Tools marked 'high' context cost return large results—use filtering parameters\n"
    output += "- For `read_server_logs`, use `summary_only: true` to get stats without full logs\n"
    output += "- For `list_guides`, use `detail_level: 'brief'` to get only titles\n"

    return {
      content: [
        {
          type: "text" as const,
          text: output,
        },
      ],
      isError: false,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    return {
      content: [
        {
          type: "text" as const,
          text: `# Tool Search Failed\n\nError: ${errorMessage}`,
        },
      ],
      isError: true,
    }
  }
}

export const searchToolsTool = tool(
  "search_tools",
  `Discovers available tools by category using progressive disclosure. Returns tool metadata with configurable detail levels.

Available categories: ${TOOL_CATEGORIES.join(", ")}

Best practices:
- Start with 'minimal' to browse tool names (lowest context usage)
- Use 'standard' for descriptions and context costs
- Only use 'full' when you need complete parameter schemas

Examples:
- search_tools({ category: "documentation" }) - Browse documentation tools with standard detail
- search_tools({ category: "workspace", detail_level: "full" }) - Get full schemas for workspace tools
- search_tools({ category: "debugging", detail_level: "minimal" }) - List debugging tools (names only)`,
  searchToolsParamsSchema,
  async args => {
    return searchTools(args)
  },
)

/**
 * Get list of enabled MCP tool names with mcp__ prefixes
 * Used by Alive to configure allowedTools
 */
export function getEnabledMcpToolNames(): string[] {
  return getSearchToolRegistry()
    .filter(tool => tool.enabled)
    .map(tool => {
      // Map tool names to their actual MCP tool names
      if (tool.category === "workspace") {
        return `mcp__alive-workspace__${tool.name}`
      }
      if (tool.category === "external-mcp") {
        return tool.name // External MCP servers don't get prefixes
      }
      return `mcp__alive-tools__${tool.name}`
    })
}
