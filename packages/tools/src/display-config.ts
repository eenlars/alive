/**
 * Tool Display Configuration
 *
 * Non-React display logic for tool results:
 * - Auto-expand behavior
 * - Preview text generation
 * - Data transformation (MCP unwrapping)
 *
 * React components are registered separately in the web app.
 *
 * @example
 * ```typescript
 * import { getDisplayConfig, shouldAutoExpand, getPreview } from "@webalive/tools"
 *
 * const config = getDisplayConfig("mcp__linear__create_issue")
 * const preview = getPreview("mcp__linear__list_issues", data)
 * ```
 */

import { AI, EMAIL, FILE_OPS, LINEAR, OTHER, PLAN, STRIPE, STRIPE_PATTERNS } from "./tool-names.js"

// ============================================================
// TYPES
// ============================================================

/**
 * Display configuration for a tool (no React dependencies)
 */
export interface ToolDisplayConfig {
  /** Auto-expand when result arrives? */
  autoExpand: boolean
  /** Show in normal mode? (default: true, false = debug-only) */
  visibleInNormalMode: boolean
  /** Generate preview text for collapsed state */
  getPreview?: (data: unknown, input?: unknown) => string
  /** Transform raw data before display */
  transform?: (rawData: unknown) => unknown
}

type ConfigInput = Partial<ToolDisplayConfig>

// ============================================================
// HELPERS
// ============================================================

/** Unwrap MCP text wrapper: [{type: "text", text: "JSON"}] → parsed JSON */
export function unwrapMcp(content: unknown): unknown {
  if (Array.isArray(content) && content[0]?.type === "text" && content[0]?.text) {
    try {
      return JSON.parse(content[0].text)
    } catch {
      return content
    }
  }
  return content
}

/** Pluralize helper */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return count === 1 ? singular : (pluralForm ?? `${singular}s`)
}

/** Safe array length */
function arrayLength(data: unknown): number {
  return Array.isArray(data) ? data.length : 0
}

// ============================================================
// PREVIEW GENERATORS
// ============================================================

const linearIssuePreview = (data: unknown): string => {
  const d = data as Record<string, unknown> | null
  if (d?.identifier && d?.title) {
    const title = String(d.title)
    const truncated = title.length > 30 ? `${title.slice(0, 30)}...` : title
    return `${d.identifier}: ${truncated}`
  }
  return "issue"
}

const linearIssuesPreview = (data: unknown): string => {
  if (!Array.isArray(data)) return "issues"
  const inProgress = data.filter((i: Record<string, unknown>) => i.status === "In Progress").length
  const suffix = inProgress > 0 ? ` (${inProgress} in progress)` : ""
  return `${data.length} ${plural(data.length, "issue")}${suffix}`
}

const stripeCustomersPreview = (data: unknown): string => {
  const d = data as Record<string, unknown> | null
  const customers = d?.data || data
  const count = arrayLength(customers)
  return `${count} ${plural(count, "customer")}`
}

const stripePaymentIntentsPreview = (data: unknown): string => {
  if (!Array.isArray(data)) return "payment intents"
  const succeeded = data.filter((pi: Record<string, unknown>) => pi.status === "succeeded").length
  return `${data.length} ${plural(data.length, "payment")} (${succeeded} succeeded)`
}

const readPreview = (_data: unknown, input?: unknown): string => {
  const d = _data as Record<string, unknown> | null
  const inp = input as Record<string, unknown> | null
  const fileName = inp?.file_path ? String(inp.file_path).split("/").pop() : null

  if (d?.total_lines) {
    const lines = d.lines_returned || d.total_lines
    return fileName ? `${fileName} (${lines} lines)` : `${lines} lines`
  }
  if (d?.file_size) return fileName || "image"
  if (d?.total_pages) return fileName || "pdf"
  if (d?.cells) return fileName || "notebook"
  return fileName || "file"
}

const editPreview = (_data: unknown, input?: unknown): string => {
  const d = _data as Record<string, unknown> | null
  const inp = input as Record<string, unknown> | null
  const fileName = inp?.file_path ? String(inp.file_path).split("/").pop() : null

  if (d?.replacements !== undefined) {
    const changes = `${d.replacements} ${plural(Number(d.replacements), "change")}`
    return fileName ? `${fileName} (${changes})` : changes
  }
  return fileName || "edited"
}

const grepPreview = (data: unknown): string => {
  const d = data as Record<string, unknown> | null
  if (d?.count !== undefined) return `found ${d.count} files`
  if (d?.total_matches !== undefined) return `found ${d.total_matches} matches`
  if (d?.total !== undefined) return `found ${d.total} matches`
  return "grep"
}

const bashPreview = (data: unknown): string => {
  const d = data as Record<string, unknown> | null
  if (d?.exitCode !== undefined) {
    return d.exitCode === 0 ? "completed" : `failed (${d.exitCode})`
  }
  return "bash"
}

// ============================================================
// REGISTRY
// ============================================================

const exactRegistry = new Map<string, ConfigInput>()
const patternRegistry: Array<{ pattern: string; config: ConfigInput }> = []

const DEFAULT_CONFIG: ToolDisplayConfig = {
  autoExpand: false,
  visibleInNormalMode: true,
}

function register(toolName: string, config: ConfigInput): void {
  const name = toolName.toLowerCase()
  if (name.includes("*")) {
    patternRegistry.push({ pattern: name, config })
  } else {
    exactRegistry.set(name, config)
  }
}

function matchesPattern(pattern: string, toolName: string): boolean {
  const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
  return new RegExp(`^${regexPattern}$`, "i").test(toolName)
}

// ============================================================
// REGISTRATIONS
// ============================================================

// --- Linear ---
register(LINEAR.CREATE_ISSUE, {
  autoExpand: true,
  transform: unwrapMcp,
  getPreview: data => {
    const d = data as Record<string, unknown> | null
    return d?.identifier ? `created ${d.identifier}` : "created issue"
  },
})

register(LINEAR.UPDATE_ISSUE, {
  autoExpand: true,
  transform: unwrapMcp,
  getPreview: data => {
    const d = data as Record<string, unknown> | null
    return d?.identifier ? `updated ${d.identifier}` : "updated issue"
  },
})

register(LINEAR.GET_ISSUE, {
  autoExpand: true,
  transform: unwrapMcp,
  getPreview: linearIssuePreview,
})

register(LINEAR.LIST_ISSUES, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: linearIssuesPreview,
})

register(LINEAR.CREATE_COMMENT, {
  autoExpand: true,
  transform: unwrapMcp,
  getPreview: () => "comment added",
})

register(LINEAR.LIST_COMMENTS, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: data => {
    const count = arrayLength(data)
    return `${count} ${plural(count, "comment")}`
  },
})

register(LINEAR.LIST_PROJECTS, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: data => {
    const count = arrayLength(data)
    return `${count} ${plural(count, "project")}`
  },
})

register(LINEAR.LIST_TEAMS, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: data => {
    const count = arrayLength(data)
    return `${count} ${plural(count, "team")}`
  },
})

// --- Stripe patterns ---
register(STRIPE_PATTERNS.CREATE_ANY, { autoExpand: true })
register(STRIPE_PATTERNS.UPDATE_ANY, { autoExpand: true })
register(STRIPE_PATTERNS.LIST_ANY, { autoExpand: false })
register(STRIPE_PATTERNS.GET_ANY, { autoExpand: false })
register(STRIPE_PATTERNS.RETRIEVE_ANY, { autoExpand: false })
register(STRIPE_PATTERNS.SEARCH_ANY, { autoExpand: false })

// --- Stripe specific ---
register(STRIPE.LIST_SUBSCRIPTIONS, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: data => {
    const count = arrayLength(data)
    return `${count} ${plural(count, "subscription")}`
  },
})

register(STRIPE.LIST_CUSTOMERS, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: stripeCustomersPreview,
})

register(STRIPE.FETCH_RESOURCES, {
  autoExpand: false,
  getPreview: data => {
    if (Array.isArray(data)) {
      const count = data.filter((item: Record<string, unknown>) => item.type === "text").length
      return `${count} ${plural(count, "resource")}`
    }
    return "resources"
  },
})

register(STRIPE.RETRIEVE_BALANCE, {
  autoExpand: false,
  getPreview: () => "balance",
})

register(STRIPE.GET_ACCOUNT_INFO, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: data => {
    const d = data as Record<string, unknown> | null
    return (d?.display_name as string) || "account info"
  },
})

register(STRIPE.LIST_PAYMENT_INTENTS, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: stripePaymentIntentsPreview,
})

register(STRIPE.SEARCH_RESOURCES, {
  autoExpand: false,
  transform: unwrapMcp,
  getPreview: data => {
    const d = data as Record<string, unknown> | null
    const results = d?.results as unknown[] | undefined
    const count = results?.length ?? 0
    return `${count} ${plural(count, "result")}`
  },
})

// --- File operations ---
register(FILE_OPS.READ, { autoExpand: false, getPreview: readPreview })
register(FILE_OPS.WRITE, {
  autoExpand: false,
  getPreview: (_data, input) => {
    const d = _data as Record<string, unknown> | null
    const inp = input as Record<string, unknown> | null
    const fileName = inp?.file_path ? String(inp.file_path).split("/").pop() : null
    if (d?.bytes_written) {
      return fileName || "file written"
    }
    return fileName || "file"
  },
})
register(FILE_OPS.EDIT, { autoExpand: false, getPreview: editPreview })
register(FILE_OPS.GREP, { autoExpand: false, getPreview: grepPreview })
register(FILE_OPS.GLOB, {
  autoExpand: false,
  getPreview: data => {
    const d = data as Record<string, unknown> | null
    return d?.count !== undefined ? `found ${d.count} files` : "glob"
  },
})

// --- AI tools ---
register(AI.ASK_CLARIFICATION, {
  autoExpand: true, // Always show the questionnaire
  transform: unwrapMcp,
  getPreview: data => {
    const d = data as Record<string, unknown> | null
    const questions = d?.questions as unknown[] | undefined
    const count = questions?.length ?? 0
    return `${count} ${plural(count, "question")}`
  },
})

register(AI.ASK_WEBSITE_CONFIG, {
  autoExpand: true, // Always show the config form
  transform: unwrapMcp,
  getPreview: () => "configure website",
})

register(AI.ASK_AUTOMATION_CONFIG, {
  autoExpand: true, // Always show the config form
  transform: unwrapMcp,
  getPreview: () => "configure automation",
})

// --- Email tools ---
register(EMAIL.COMPOSE, {
  autoExpand: true, // Always show the email card
  transform: unwrapMcp,
  getPreview: data => {
    const d = data as Record<string, unknown> | null
    const subject = d?.subject as string | undefined
    return subject ? `Draft: ${subject.slice(0, 30)}...` : "email draft"
  },
})

// --- Plan mode tools ---
register(PLAN.EXIT_PLAN_MODE, {
  autoExpand: true, // Always show the approval UI
  getPreview: () => "plan ready for approval",
})

// --- Other ---
register(OTHER.BASH, { autoExpand: false, getPreview: bashPreview })
register(OTHER.TASK, { autoExpand: false, getPreview: () => "completed" })

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Get display configuration for a tool
 */
export function getDisplayConfig(toolName: string): ToolDisplayConfig {
  const name = toolName.toLowerCase()

  // 1. Exact match
  const exact = exactRegistry.get(name)
  if (exact) {
    return { ...DEFAULT_CONFIG, ...exact }
  }

  // 2. Pattern match
  for (const { pattern, config } of patternRegistry) {
    if (matchesPattern(pattern, name)) {
      return { ...DEFAULT_CONFIG, ...config }
    }
  }

  // 3. Default
  return DEFAULT_CONFIG
}

/**
 * Should this tool result auto-expand?
 */
export function shouldAutoExpand(toolName: string, _isError: boolean): boolean {
  return getDisplayConfig(toolName).autoExpand
}

/**
 * Is this tool visible in normal (non-debug) mode?
 */
export function isVisibleInNormalMode(toolName: string): boolean {
  return getDisplayConfig(toolName).visibleInNormalMode
}

/**
 * Get preview text for collapsed tool result
 */
export function getPreview(toolName: string, data: unknown, input?: unknown): string {
  const config = getDisplayConfig(toolName)
  if (config.getPreview) {
    try {
      return config.getPreview(data, input)
    } catch {
      // Fall through
    }
  }
  return toolName.toLowerCase()
}

/**
 * Transform data for display (e.g., unwrap MCP format)
 */
export function transformData(toolName: string, data: unknown): unknown {
  const config = getDisplayConfig(toolName)
  if (config.transform) {
    return config.transform(data)
  }
  return data
}

/**
 * Register a custom tool display config (for extensions)
 */
export function registerDisplayConfig(toolName: string, config: ConfigInput): void {
  register(toolName, config)
}
