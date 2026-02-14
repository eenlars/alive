/**
 * Tool Registry
 *
 * Central registry of all MCP tools with their metadata.
 * Internal tools are defined here. External MCP entries are auto-generated
 * from GLOBAL_MCP_PROVIDERS and OAUTH_MCP_PROVIDERS in @webalive/shared.
 */
import { DEFAULTS, GLOBAL_MCP_PROVIDERS, getTemplateIdsInline, OAUTH_MCP_PROVIDERS } from "@webalive/shared"

/**
 * SDK Built-in Tools
 *
 * These are Claude Agent SDK's built-in file operation tools.
 * They are NOT included in the tool registry but are always available.
 */
export const SDK_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"] as const

export type SDKTool = (typeof SDK_TOOLS)[number]

/**
 * Tool categories (typed for compile-time safety)
 */
export const TOOL_CATEGORIES = [
  "meta",
  "composite",
  "batch",
  "documentation",
  "debugging",
  "development",
  "workspace",
  "external-mcp",
] as const

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]

/**
 * Context cost levels
 */
export type ContextCost = "low" | "medium" | "high"

/**
 * Detail levels for progressive disclosure
 */
export const DETAIL_LEVELS = ["minimal", "standard", "full"] as const

export type DetailLevel = (typeof DETAIL_LEVELS)[number]

/**
 * Tool metadata for discovery and progressive disclosure
 */
export interface ToolMetadata {
  name: string
  category: ToolCategory
  description: string
  contextCost: ContextCost
  enabled: boolean
  /** External MCP provider key (for category: external-mcp) */
  providerKey?: string
  /** Whether this external MCP entry requires OAuth connection */
  requiresOAuthConnection?: boolean
  /** If true, this tool is only available to superadmins even if enabled=false in general */
  superadminOnly?: boolean
  parameters?: {
    name: string
    type: string
    required: boolean
    description: string
  }[]
}

const INTERNAL_TOOL_REGISTRY: ToolMetadata[] = [
  // Meta tools (tool discovery)
  {
    name: "search_tools",
    category: "meta",
    description:
      "Discovers available tools by category using progressive disclosure. Returns tool metadata with configurable detail levels.",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "category",
        type: "string",
        required: true,
        description:
          "Category to search (meta, composite, batch, documentation, debugging, development, workspace, external-mcp)",
      },
      {
        name: "detail_level",
        type: "string",
        required: false,
        description:
          "'minimal' (names only), 'standard' (names + descriptions), 'full' (complete parameter schemas). Default: 'standard'",
      },
    ],
  },
  {
    name: "list_workflows",
    category: "meta",
    description:
      "Lists all available workflow types. Use this to discover what workflows exist before calling get_workflow.",
    contextCost: "low",
    enabled: true,
    parameters: [],
  },
  {
    name: "get_workflow",
    category: "meta",
    description:
      "Retrieves full workflow decision trees for common development tasks (bug debugging, new features, package installation, website shippable check, functionality check). Returns the complete workflow content.",
    contextCost: "medium",
    enabled: true,
    parameters: [
      {
        name: "workflow_type",
        type: "string",
        required: true,
        description:
          "Type of workflow: bug-debugging, new-feature, package-installation, website-shippable-check, functionality-check",
      },
    ],
  },

  // Composite tools (reduce round trips)
  {
    name: "debug_workspace",
    category: "composite",
    description: "All-in-one debugging: reads logs + analyzes patterns + suggests fixes. USE THIS FIRST for debugging.",
    contextCost: "medium",
    enabled: true,
    parameters: [
      {
        name: "workspace",
        type: "string",
        required: true,
        description: "Workspace domain",
      },
      {
        name: "lines",
        type: "number",
        required: false,
        description: "Log lines to analyze (default: 200)",
      },
      {
        name: "since",
        type: "string",
        required: false,
        description: "Time range (e.g., '5 minutes ago')",
      },
    ],
  },
  {
    name: "find_guide",
    category: "composite",
    description: "Searches AND retrieves guides in one call. Reduces round trips from 2+ to 1.",
    contextCost: "high",
    enabled: false,
    parameters: [
      {
        name: "query",
        type: "string",
        required: true,
        description: "Search query (e.g., 'authentication', 'vite errors')",
      },
      {
        name: "category",
        type: "string",
        required: false,
        description: "Optional category filter",
      },
      {
        name: "auto_retrieve",
        type: "boolean",
        required: false,
        description: "If true, retrieves best match. If false, lists matches. Default: true",
      },
    ],
  },

  // Batch operations
  {
    name: "batch_get_guides",
    category: "batch",
    description: "Retrieves multiple guides in one call (max 5). Reduces round trips for bulk operations.",
    contextCost: "high",
    enabled: false,
    parameters: [
      {
        name: "requests",
        type: "array",
        required: true,
        description: "Array of guide requests (max 5), each with category and optional topic",
      },
      {
        name: "include_separator",
        type: "boolean",
        required: false,
        description: "Add separators between guides. Default: true",
      },
    ],
  },

  // Documentation tools
  {
    name: "list_guides",
    category: "documentation",
    description: "Lists available development guides with result hints. Context-efficient modes available.",
    contextCost: "low",
    enabled: false,
    parameters: [
      {
        name: "category",
        type: "string",
        required: false,
        description: "Guide category (e.g., '30-guides', 'workflows')",
      },
      {
        name: "detail_level",
        type: "string",
        required: false,
        description: "'brief' (titles only) or 'full' (titles + descriptions). Default: 'brief'",
      },
    ],
  },
  {
    name: "get_guide",
    category: "documentation",
    description: "Retrieves full guide content. Can return large markdown documents.",
    contextCost: "high",
    enabled: false,
    parameters: [
      {
        name: "category",
        type: "string",
        required: true,
        description: "Guide category",
      },
      {
        name: "topic",
        type: "string",
        required: false,
        description: "Filter by topic keyword",
      },
    ],
  },

  // Template tools
  {
    name: "get_alive_super_template",
    category: "documentation",
    description: "Retrieves Alive Super Template content for implementing specific features.",
    contextCost: "high",
    enabled: true,
    parameters: [
      {
        name: "template_id",
        type: "string",
        required: true,
        description: "Template ID (e.g., 'carousel-thumbnails')",
      },
    ],
  },

  // Debugging tools
  {
    name: "read_server_logs",
    category: "debugging",
    description:
      "Reads systemd logs with summary mode, regex filtering, and result hints. Advanced filtering available.",
    contextCost: "high",
    enabled: true,
    parameters: [
      {
        name: "workspace",
        type: "string",
        required: true,
        description: "Workspace domain (e.g., 'two.sonno.tech')",
      },
      {
        name: "search",
        type: "string",
        required: false,
        description: "Basic search term",
      },
      {
        name: "search_regex",
        type: "string",
        required: false,
        description: "Advanced regex pattern (e.g., 'error|warn', 'failed.*build')",
      },
      {
        name: "lines",
        type: "number",
        required: false,
        description: "Number of log lines (1-1000, default: 100)",
      },
      {
        name: "since",
        type: "string",
        required: false,
        description: "Time range (e.g., '5 minutes ago')",
      },
      {
        name: "summary_only",
        type: "boolean",
        required: false,
        description: "Return only summary stats (context-efficient). Default: false",
      },
    ],
  },

  // AI tools
  {
    name: "ask_clarification",
    category: "meta",
    description:
      "Ask the user clarification questions when their request is ambiguous. Presents 1-3 multiple choice questions with custom input option. Use when planning complex tasks or when user intent needs clarification.",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "questions",
        type: "array",
        required: true,
        description: "1-3 clarification questions, each with id, question text, and exactly 3 options",
      },
      {
        name: "context",
        type: "string",
        required: false,
        description: "Optional context about why these questions are being asked",
      },
    ],
  },
  {
    name: "ask_website_config",
    category: "meta",
    description:
      "Show an interactive form for the user to configure a new website. Use when the user wants to create a website - presents a wizard to choose subdomain, template, and optional description. After submission, use create_website with the user's choices.",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "context",
        type: "string",
        required: false,
        description: "Optional context about why a website is being created",
      },
      {
        name: "defaultSlug",
        type: "string",
        required: false,
        description: "Optional default slug to pre-fill in the form",
      },
    ],
  },
  {
    name: "ask_automation_config",
    category: "meta",
    description:
      "Show an interactive form for the user to configure a scheduled automation. Use when the user wants to schedule a task - presents a wizard to set task name, prompt, website, and schedule (once, daily, weekly, monthly, or custom cron). After submission, create the automation via the API.",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "context",
        type: "string",
        required: false,
        description: "Optional context about why an automation is being created",
      },
      {
        name: "defaultSiteId",
        type: "string",
        required: false,
        description: "Optional default site ID to pre-select",
      },
    ],
  },

  // Other tools
  {
    name: "generate_persona",
    category: "development",
    description: "Generates persona content for testing",
    contextCost: "medium",
    enabled: true,
  },
  {
    name: "check_codebase",
    category: "workspace",
    description:
      "Runs TypeScript type checking (tsc) and ESLint to verify code quality. Use BEFORE committing code, after making changes, or when debugging type errors. Returns detailed information about any TypeScript errors or lint warnings found.",
    contextCost: "medium",
    enabled: true,
    parameters: [],
  },
  {
    name: "restart_dev_server",
    category: "workspace",
    description: "Restarts systemd dev server for a workspace",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "workspace",
        type: "string",
        required: true,
        description: "Workspace domain",
      },
    ],
  },
  {
    name: "install_package",
    category: "workspace",
    description: "Install a package in the user's workspace using bun",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "package_name",
        type: "string",
        required: true,
        description: "Package name to install (e.g., 'lodash', '@types/node')",
      },
    ],
  },
  {
    name: "delete_file",
    category: "workspace",
    description:
      "Delete a file or directory from the workspace. Cannot delete protected files (index.ts, package.json) or directories (node_modules, .git).",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "path",
        type: "string",
        required: true,
        description: "Path to the file or directory to delete, relative to workspace root",
      },
      {
        name: "recursive",
        type: "boolean",
        required: false,
        description: "Required for deleting directories. Set to true to delete directory and all contents.",
      },
    ],
  },
  {
    name: "switch_serve_mode",
    category: "workspace",
    description:
      "Switch between development server (hot reload) and production build serving. Use 'build' mode for faster page loads when testing, 'dev' mode for active development.",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "mode",
        type: "string",
        required: true,
        description: "'dev' for development server (hot reload), 'build' for production build (faster, no hot reload)",
      },
      {
        name: "build_first",
        type: "boolean",
        required: false,
        description: "When switching to 'build' mode, run the build first (default: true)",
      },
    ],
  },
  {
    name: "copy_shared_asset",
    category: "workspace",
    description:
      "Copy shared assets (fonts, icons) to workspace with correct file ownership. Available: fonts/satoshi.",
    contextCost: "low",
    enabled: true,
    parameters: [
      {
        name: "asset",
        type: "string",
        required: true,
        description: "Asset to copy (e.g., 'fonts/satoshi')",
      },
      {
        name: "dest",
        type: "string",
        required: false,
        description: "Destination path relative to workspace root (default: asset's suggested destination)",
      },
    ],
  },
  {
    name: "create_website",
    category: "workspace",
    description: `Deploy a new website with automatic infrastructure setup. Creates subdomain, SSL, systemd service, and Caddy reverse proxy. The site is immediately live at https://{slug}.${DEFAULTS.WILDCARD_DOMAIN}`,
    contextCost: "high",
    enabled: true,
    parameters: [
      {
        name: "slug",
        type: "string",
        required: true,
        description: `Subdomain name (3-16 chars, lowercase letters/numbers/hyphens). Example: 'my-bakery' creates my-bakery.${DEFAULTS.WILDCARD_DOMAIN}`,
      },
      {
        name: "siteIdeas",
        type: "string",
        required: false,
        description: "Description of what the website should be about (helps guide initial design)",
      },
      {
        name: "templateId",
        type: "string",
        required: false,
        description: `Template ID (${getTemplateIdsInline()}). Default: ${DEFAULTS.DEFAULT_TEMPLATE_ID}`,
      },
    ],
  },

  // External MCP entries are auto-generated below from shared registries
]

/**
 * Auto-generate external MCP entries from shared registries.
 * Single source of truth - no manual duplication needed.
 */
function generateExternalMcpEntries(): ToolMetadata[] {
  const entries: ToolMetadata[] = []

  // From GLOBAL_MCP_PROVIDERS (always available, no auth)
  for (const [key, config] of Object.entries(GLOBAL_MCP_PROVIDERS)) {
    entries.push({
      name: key.replace(/-/g, "_"), // Convert to snake_case for consistency
      providerKey: key,
      requiresOAuthConnection: false,
      category: "external-mcp",
      description: `${config.friendlyName} integration (always available)`,
      contextCost: "medium",
      enabled: false, // External HTTP server, not registered in internal MCP
    })
  }

  // From OAUTH_MCP_PROVIDERS (requires user authentication)
  for (const [key, config] of Object.entries(OAUTH_MCP_PROVIDERS)) {
    entries.push({
      name: key,
      providerKey: key,
      requiresOAuthConnection: true,
      category: "external-mcp",
      description: `${config.friendlyName} integration (requires OAuth connection)`,
      contextCost: "medium",
      enabled: false, // External HTTP server, not registered in internal MCP
    })
  }

  return entries
}

/**
 * Complete tool registry including auto-generated external MCP entries.
 * Use this for search_tools and other discovery functions.
 */
export const TOOL_REGISTRY: ToolMetadata[] = [...INTERNAL_TOOL_REGISTRY, ...generateExternalMcpEntries()]

/**
 * Tool registry for runtime discovery.
 * Filters out OAuth-gated external MCP entries the user has not connected.
 */
export function getSearchToolRegistry(connectedOAuthProviders: string[] = []): ToolMetadata[] {
  const connected = new Set(connectedOAuthProviders)

  return TOOL_REGISTRY.filter(tool => {
    if (tool.category !== "external-mcp") return true
    if (!tool.requiresOAuthConnection) return true
    if (!tool.providerKey) return false
    return connected.has(tool.providerKey)
  })
}
