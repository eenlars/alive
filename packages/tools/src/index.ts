/**
 * @webalive/tools
 *
 * Comprehensive MCP tool suite for Alive development platform.
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

// Display configuration (non-React)
export {
  getDisplayConfig,
  getPreview,
  isVisibleInNormalMode,
  plural,
  registerDisplayConfig,
  shouldAutoExpand,
  type ToolDisplayConfig,
  transformData,
  unwrapMcp,
} from "./display-config.js"
// AI utilities
export { type AskAIOptions, askAI, CLAUDE_MODELS, type ClaudeModel } from "./lib/ask-ai.js"
// Full-featured AI (all Claude Code tools enabled)
// Note: CLAUDE_MODELS is already exported from ask-ai.ts above
export {
  type AskAIFullOptions,
  type AskAIFullResult,
  ask,
  askAIFull,
  askBridge,
  PERMISSION_MODES,
  type PermissionMode,
  SETTINGS_SOURCES,
  type SettingsSource,
} from "./lib/ask-ai-full.js"
export {
  type ParsedSkill,
  parseSkillContent,
  type SkillFrontmatter,
  skillIdToDisplayName,
} from "./lib/skill-frontmatter.js"
export {
  isTemplateEnabled,
  type PartialTemplateFrontmatter,
  parseFrontmatter,
  REQUIRED_FRONTMATTER_FIELDS,
  type TemplateFrontmatter,
  validateFrontmatter,
} from "./lib/template-frontmatter.js"
// MCP servers
export { emailInternalMcp, supabaseInternalMcp, toolsInternalMcp, workspaceInternalMcp } from "./mcp-server.js"
export type {
  AITool,
  AutomationTool,
  EmailTool,
  FileOpTool,
  LinearTool,
  OtherTool,
  StripeTool,
  ToolName,
} from "./tool-names.js"
// Tool name constants
export { AI, AUTOMATION, CALENDAR, EMAIL, FILE_OPS, LINEAR, OTHER, STRIPE } from "./tool-names.js"
export {
  getEnabledMcpToolNames,
  setSearchToolsConnectedProviders,
  withSearchToolsConnectedProviders,
} from "./tools/meta/search-tools.js"
export { SDK_TOOLS, type SDKTool } from "./tools/meta/tool-registry.js"
// Scheduled Tasks (Cron) Tools
export {
  calculateNextRunTime,
  createDefaultExecutor,
  // Store operations
  createJob,
  deleteJob,
  executeScheduledCreate,
  executeScheduledDelete,
  executeScheduledList,
  executeScheduledTrigger,
  executeScheduledUpdate,
  formatSchedule,
  getDueJobs,
  getJob,
  getSchedulerStatus,
  getStoreStatus,
  isValidCronExpression,
  isValidPayload,
  // Validation & helpers
  isValidSchedule,
  type JobExecutionContext,
  type JobExecutionResult,
  type JobState,
  type JobStatus,
  listJobs,
  markJobCompleted,
  markJobRunning,
  type Payload,
  type PayloadAgentTurn,
  type PayloadSystemEvent,
  registerJobExecutor,
  // All tool definitions
  SCHEDULED_TOOL_DEFINITIONS,
  // Types
  type Schedule,
  type ScheduleAt,
  type ScheduleCron,
  type ScheduledCreateParams,
  type ScheduledDeleteParams,
  type ScheduledJob,
  type ScheduledJobCreate,
  type ScheduledJobListParams,
  type ScheduledJobListResult,
  type ScheduledJobUpdate,
  type ScheduledListParams,
  type ScheduledListResult,
  type ScheduledToolContext,
  type ScheduledTriggerParams,
  type ScheduledUpdateParams,
  type ScheduleEvery,
  // Tool: scheduled_create
  scheduledCreateSchema,
  scheduledCreateToolDefinition,
  // Tool: scheduled_delete
  scheduledDeleteSchema,
  scheduledDeleteToolDefinition,
  // Tool: scheduled_list
  scheduledListSchema,
  scheduledListToolDefinition,
  // Tool: scheduled_trigger
  scheduledTriggerSchema,
  scheduledTriggerToolDefinition,
  // Tool: scheduled_update
  scheduledUpdateSchema,
  scheduledUpdateToolDefinition,
  // Scheduler
  startScheduler,
  stopScheduler,
  triggerJob,
  updateJob,
} from "./tools/scheduled/index.js"
// Agent-to-Agent (A2A) Session Tools
export {
  type AgentToAgentPolicy,
  DEFAULT_A2A_POLICY,
  executeSessionsHistory,
  executeSessionsList,
  executeSessionsSend,
  isA2AAllowed,
  // Types
  type SessionInfo,
  type SessionMessage,
  type SessionSendResult,
  type SessionsHistoryContext,
  type SessionsHistoryParams,
  type SessionsHistoryResult,
  type SessionsListContext,
  type SessionsListParams,
  type SessionsListResult,
  type SessionsSendContext,
  type SessionsSendParams,
  // sessions_history
  sessionsHistorySchema,
  sessionsHistoryToolDefinition,
  // sessions_list
  sessionsListSchema,
  sessionsListToolDefinition,
  // sessions_send
  sessionsSendSchema,
  sessionsSendToolDefinition,
} from "./tools/sessions/index.js"
// Skill utilities
export {
  getSkillById,
  listProjectSkills,
  listSuperadminSkills,
  listSkillsFromDir,
  mergeSkills,
  type SkillListItem,
  type SkillSource,
} from "./tools/skills/list-skills.js"
// Template utilities
export {
  getTemplateById,
  getTemplatesByCategory,
  listTemplates,
  TEMPLATE_CATEGORIES,
  type TemplateCategory,
  type TemplateListItem,
} from "./tools/templates/list-templates.js"
