/**
 * SDK Tools Sync - Type validation against Claude Agent SDK
 *
 * This file validates that our Bridge tool lists (from @webalive/shared)
 * match the actual SDK types. Provides compile-time safety.
 *
 * SOURCE OF TRUTH for tool arrays: @webalive/shared/bridge-tools.ts
 * This file only does TYPE VALIDATION.
 */

import type {
  AgentInput,
  AskUserQuestionInput,
  BashInput,
  BashOutputInput,
  ExitPlanModeInput,
  FileEditInput,
  FileReadInput,
  FileWriteInput,
  GlobInput,
  GrepInput,
  KillShellInput,
  ListMcpResourcesInput,
  McpInput,
  NotebookEditInput,
  ReadMcpResourceInput,
  TodoWriteInput,
  ToolInputSchemas,
  WebFetchInput,
  WebSearchInput,
} from "@anthropic-ai/claude-agent-sdk/sdk-tools"

// Import from shared - single source of truth
import {
  BRIDGE_ADMIN_ONLY_SDK_TOOLS,
  BRIDGE_ALLOWED_SDK_TOOLS,
  BRIDGE_ALWAYS_DISALLOWED_SDK_TOOLS,
  type BridgeAllowedSDKTool,
  type BridgeDisallowedSDKTool,
  getBridgeDisallowedTools,
} from "@webalive/shared"

// Re-export for use in tests
export const ALLOWED_SDK_TOOLS = BRIDGE_ALLOWED_SDK_TOOLS
// Combined list for tests (all disallowed for non-admin = full list)
export const DISALLOWED_SDK_TOOLS = getBridgeDisallowedTools(false)
export type AllowedSDKTool = BridgeAllowedSDKTool
export type DisallowedSDKTool = BridgeDisallowedSDKTool

// Export granular lists for advanced use cases
export const ADMIN_ONLY_SDK_TOOLS = BRIDGE_ADMIN_ONLY_SDK_TOOLS
export const ALWAYS_DISALLOWED_SDK_TOOLS = BRIDGE_ALWAYS_DISALLOWED_SDK_TOOLS

/**
 * Maps SDK Input types to their tool names.
 */
type SDKToolMap = {
  AgentInput: "Task"
  BashInput: "Bash"
  BashOutputInput: "BashOutput"
  ExitPlanModeInput: "ExitPlanMode"
  FileEditInput: "Edit"
  FileReadInput: "Read"
  FileWriteInput: "Write"
  GlobInput: "Glob"
  GrepInput: "Grep"
  KillShellInput: "KillShell"
  ListMcpResourcesInput: "ListMcpResources"
  McpInput: "Mcp"
  NotebookEditInput: "NotebookEdit"
  ReadMcpResourceInput: "ReadMcpResource"
  TodoWriteInput: "TodoWrite"
  WebFetchInput: "WebFetch"
  WebSearchInput: "WebSearch"
  AskUserQuestionInput: "AskUserQuestion"
}

/**
 * Type-level validation using imported types.
 * If SDK removes a tool type, the import will fail at compile time.
 */
type _ValidateAgentInput = AgentInput extends ToolInputSchemas ? true : never
type _ValidateBashInput = BashInput extends ToolInputSchemas ? true : never
type _ValidateBashOutputInput = BashOutputInput extends ToolInputSchemas ? true : never
type _ValidateExitPlanModeInput = ExitPlanModeInput extends ToolInputSchemas ? true : never
type _ValidateFileEditInput = FileEditInput extends ToolInputSchemas ? true : never
type _ValidateFileReadInput = FileReadInput extends ToolInputSchemas ? true : never
type _ValidateFileWriteInput = FileWriteInput extends ToolInputSchemas ? true : never
type _ValidateGlobInput = GlobInput extends ToolInputSchemas ? true : never
type _ValidateGrepInput = GrepInput extends ToolInputSchemas ? true : never
type _ValidateKillShellInput = KillShellInput extends ToolInputSchemas ? true : never
type _ValidateListMcpResourcesInput = ListMcpResourcesInput extends ToolInputSchemas ? true : never
type _ValidateMcpInput = McpInput extends ToolInputSchemas ? true : never
type _ValidateNotebookEditInput = NotebookEditInput extends ToolInputSchemas ? true : never
type _ValidateReadMcpResourceInput = ReadMcpResourceInput extends ToolInputSchemas ? true : never
type _ValidateTodoWriteInput = TodoWriteInput extends ToolInputSchemas ? true : never
type _ValidateWebFetchInput = WebFetchInput extends ToolInputSchemas ? true : never
type _ValidateWebSearchInput = WebSearchInput extends ToolInputSchemas ? true : never
type _ValidateAskUserQuestionInput = AskUserQuestionInput extends ToolInputSchemas ? true : never

const _assertAllTypesExist: true = true as
  | _ValidateAgentInput
  | _ValidateBashInput
  | _ValidateBashOutputInput
  | _ValidateExitPlanModeInput
  | _ValidateFileEditInput
  | _ValidateFileReadInput
  | _ValidateFileWriteInput
  | _ValidateGlobInput
  | _ValidateGrepInput
  | _ValidateKillShellInput
  | _ValidateListMcpResourcesInput
  | _ValidateMcpInput
  | _ValidateNotebookEditInput
  | _ValidateReadMcpResourceInput
  | _ValidateTodoWriteInput
  | _ValidateWebFetchInput
  | _ValidateWebSearchInput
  | _ValidateAskUserQuestionInput

/**
 * All SDK tool names derived from the map.
 */
export type SDKToolName = SDKToolMap[keyof SDKToolMap]

/**
 * SDK tool names as a const array for runtime use.
 */
export const SDK_TOOL_NAMES = [
  "Task",
  "Bash",
  "BashOutput",
  "ExitPlanMode",
  "Edit",
  "Read",
  "Write",
  "Glob",
  "Grep",
  "KillShell",
  "ListMcpResources",
  "Mcp",
  "NotebookEdit",
  "ReadMcpResource",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "AskUserQuestion",
] as const satisfies readonly SDKToolName[]

/**
 * Compile-time check: Ensure allowed and disallowed don't overlap.
 */
type _OverlapCheck = BridgeAllowedSDKTool & BridgeDisallowedSDKTool
const _assertNoOverlap: _OverlapCheck extends never ? true : never = true

/**
 * Compile-time check: Ensure all SDK tools are categorized.
 */
type _AllCategorized = BridgeAllowedSDKTool | BridgeDisallowedSDKTool
type _MissingTools = Exclude<SDKToolName, _AllCategorized>
const _assertAllCategorized: _MissingTools extends never ? true : never = true

/**
 * Compile-time check: Ensure no extra tools beyond SDK.
 * Note: "Skill" is a Bridge-specific tool (loaded from .claude/skills/) not in SDK's ToolInputSchemas.
 */
type _BridgeOnlyTools = "Skill"
type _ExtraTools = Exclude<_AllCategorized, SDKToolName | _BridgeOnlyTools>
const _assertNoExtraTools: _ExtraTools extends never ? true : never = true
