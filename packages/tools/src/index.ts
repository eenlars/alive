/**
 * @webalive/tools
 *
 * Comprehensive MCP tool suite for Claude Bridge development platform.
 * Provides guides, debugging tools, and diagnostic capabilities.
 *
 * @example
 * ```typescript
 * import { toolsInternalMcp, workspaceInternalMcp } from "@webalive/tools"
 *
 * const claudeOptions = {
 *   mcpServers: {
 *     "alive-tools": toolsInternalMcp,
 *     "alive-workspace": workspaceInternalMcp
 *   },
 *   allowedTools: [
 *     "mcp__alive-tools__search_tools",
 *     "mcp__alive-tools__read_server_logs"
 *   ]
 * }
 * ```
 */

// MCP servers
export { toolsInternalMcp, workspaceInternalMcp, supabaseInternalMcp } from "./mcp-server.js"
export { getEnabledMcpToolNames } from "./tools/meta/search-tools.js"
export { SDK_TOOLS, type SDKTool } from "./tools/meta/tool-registry.js"

// Tool name constants
export { LINEAR, STRIPE, FILE_OPS, EMAIL, AI, OTHER } from "./tool-names.js"
export type { LinearTool, StripeTool, FileOpTool, EmailTool, AITool, OtherTool, ToolName } from "./tool-names.js"

// Display configuration (non-React)
export {
  getDisplayConfig,
  shouldAutoExpand,
  isVisibleInNormalMode,
  getPreview,
  transformData,
  registerDisplayConfig,
  unwrapMcp,
  plural,
} from "./display-config.js"
export type { ToolDisplayConfig } from "./display-config.js"

// AI utilities
export { askAI, CLAUDE_MODELS, type AskAIOptions, type ClaudeModel } from "./lib/ask-ai.js"

// Full-featured AI (all Claude Code tools enabled)
// Note: CLAUDE_MODELS is already exported from ask-ai.ts above
export {
  askAIFull,
  ask,
  askBridge,
  PERMISSION_MODES,
  SETTINGS_SOURCES,
  type AskAIFullOptions,
  type AskAIFullResult,
  type PermissionMode,
  type SettingsSource,
} from "./lib/ask-ai-full.js"

// Template utilities
export {
  listTemplates,
  getTemplatesByCategory,
  getTemplateById,
  TEMPLATE_CATEGORIES,
  type TemplateListItem,
  type TemplateCategory,
} from "./tools/templates/list-templates.js"
export {
  parseFrontmatter,
  isTemplateEnabled,
  validateFrontmatter,
  REQUIRED_FRONTMATTER_FIELDS,
  type TemplateFrontmatter,
  type PartialTemplateFrontmatter,
} from "./lib/template-frontmatter.js"

// Skill utilities
export {
  listSkillsFromDir,
  listGlobalSkills,
  listProjectSkills,
  mergeSkills,
  getSkillById,
  GLOBAL_SKILLS_PATH,
  type SkillListItem,
  type SkillSource,
} from "./tools/skills/list-skills.js"
export {
  parseSkillContent,
  skillIdToDisplayName,
  type SkillFrontmatter,
  type ParsedSkill,
} from "./lib/skill-frontmatter.js"

// Agent-to-Agent (A2A) Session Tools
export {
  // Types
  type SessionInfo,
  type SessionMessage,
  type SessionSendResult,
  type AgentToAgentPolicy,
  DEFAULT_A2A_POLICY,
  isA2AAllowed,
  // sessions_list
  sessionsListSchema,
  executeSessionsList,
  sessionsListToolDefinition,
  type SessionsListParams,
  type SessionsListContext,
  type SessionsListResult,
  // sessions_send
  sessionsSendSchema,
  executeSessionsSend,
  sessionsSendToolDefinition,
  type SessionsSendParams,
  type SessionsSendContext,
  // sessions_history
  sessionsHistorySchema,
  executeSessionsHistory,
  sessionsHistoryToolDefinition,
  type SessionsHistoryParams,
  type SessionsHistoryContext,
  type SessionsHistoryResult,
} from "./tools/sessions/index.js"

// Scheduled Tasks (Cron) Tools
export {
  // Types
  type Schedule,
  type ScheduleAt,
  type ScheduleEvery,
  type ScheduleCron,
  type Payload,
  type PayloadSystemEvent,
  type PayloadAgentTurn,
  type ScheduledJob,
  type JobState,
  type JobStatus,
  type ScheduledJobCreate,
  type ScheduledJobUpdate,
  type ScheduledJobListParams,
  type ScheduledJobListResult,
  type JobExecutionContext,
  type JobExecutionResult,
  type ScheduledToolContext,
  // Validation & helpers
  isValidSchedule,
  isValidPayload,
  isValidCronExpression,
  calculateNextRunTime,
  formatSchedule,
  // Store operations
  createJob,
  getJob,
  updateJob,
  deleteJob,
  listJobs,
  getDueJobs,
  markJobRunning,
  markJobCompleted,
  getStoreStatus,
  // Scheduler
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  registerJobExecutor,
  triggerJob,
  createDefaultExecutor,
  // Tool: scheduled_create
  scheduledCreateSchema,
  scheduledCreateToolDefinition,
  executeScheduledCreate,
  type ScheduledCreateParams,
  // Tool: scheduled_list
  scheduledListSchema,
  scheduledListToolDefinition,
  executeScheduledList,
  type ScheduledListParams,
  type ScheduledListResult,
  // Tool: scheduled_update
  scheduledUpdateSchema,
  scheduledUpdateToolDefinition,
  executeScheduledUpdate,
  type ScheduledUpdateParams,
  // Tool: scheduled_delete
  scheduledDeleteSchema,
  scheduledDeleteToolDefinition,
  executeScheduledDelete,
  type ScheduledDeleteParams,
  // Tool: scheduled_trigger
  scheduledTriggerSchema,
  scheduledTriggerToolDefinition,
  executeScheduledTrigger,
  type ScheduledTriggerParams,
  // All tool definitions
  SCHEDULED_TOOL_DEFINITIONS,
} from "./tools/scheduled/index.js"
