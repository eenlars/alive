/**
 * SDK Tools Sync - Type validation against Claude Agent SDK
 *
 * Validates that our Stream tool registry in @webalive/shared is aligned with
 * SDK tool names/types. This module also derives runtime allow/deny snapshots
 * for tests from the centralized stream policy registry.
 */

import type {
  AgentInput,
  AskUserQuestionInput,
  BashInput,
  ExitPlanModeInput,
  FileEditInput,
  FileReadInput,
  FileWriteInput,
  GlobInput,
  GrepInput,
  ListMcpResourcesInput,
  McpInput,
  NotebookEditInput,
  ReadMcpResourceInput,
  TaskStopInput,
  TodoWriteInput,
  ToolInputSchemas,
  WebFetchInput,
  WebSearchInput,
} from "@anthropic-ai/claude-agent-sdk/sdk-tools"

import {
  createStreamToolContext,
  getStreamToolDecision,
  STREAM_SDK_TOOL_NAMES,
  type StreamSdkToolName,
} from "@webalive/shared"

// -----------------------------------------------------------------------------
// Runtime snapshots derived from central policy
// -----------------------------------------------------------------------------

const memberContext = createStreamToolContext({
  isAdmin: false,
  isSuperadmin: false,
  isSuperadminWorkspace: false,
  isPlanMode: false,
})

const adminContext = createStreamToolContext({
  isAdmin: true,
  isSuperadmin: false,
  isSuperadminWorkspace: false,
  isPlanMode: false,
})

const superadminContext = createStreamToolContext({
  isAdmin: true,
  isSuperadmin: true,
  isSuperadminWorkspace: false,
  isPlanMode: false,
})

export const ALLOWED_SDK_TOOLS = STREAM_SDK_TOOL_NAMES.filter(
  tool => getStreamToolDecision(tool, memberContext).executable,
)
export const DISALLOWED_SDK_TOOLS = STREAM_SDK_TOOL_NAMES.filter(
  tool => !getStreamToolDecision(tool, memberContext).executable,
)

export const ADMIN_ONLY_SDK_TOOLS = STREAM_SDK_TOOL_NAMES.filter(
  tool =>
    getStreamToolDecision(tool, adminContext).executable && !getStreamToolDecision(tool, memberContext).executable,
)

export const ALWAYS_DISALLOWED_SDK_TOOLS = STREAM_SDK_TOOL_NAMES.filter(
  tool =>
    !getStreamToolDecision(tool, memberContext).executable &&
    !getStreamToolDecision(tool, adminContext).executable &&
    !getStreamToolDecision(tool, superadminContext).executable,
)

export type AllowedSDKTool = (typeof ALLOWED_SDK_TOOLS)[number]
export type DisallowedSDKTool = (typeof DISALLOWED_SDK_TOOLS)[number]

/**
 * Maps SDK Input types to their tool names.
 */
type SDKToolMap = {
  AgentInput: "Task"
  BashInput: "Bash"
  TaskOutputInput: "TaskOutput"
  ExitPlanModeInput: "ExitPlanMode"
  FileEditInput: "Edit"
  FileReadInput: "Read"
  FileWriteInput: "Write"
  GlobInput: "Glob"
  GrepInput: "Grep"
  TaskStopInput: "TaskStop"
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
 * Type-level validation using imported SDK input types.
 * If SDK removes a tool type, the import/check fails at compile time.
 */
type _ValidateAgentInput = AgentInput extends ToolInputSchemas ? true : never
type _ValidateBashInput = BashInput extends ToolInputSchemas ? true : never
type _ValidateExitPlanModeInput = ExitPlanModeInput extends ToolInputSchemas ? true : never
type _ValidateFileEditInput = FileEditInput extends ToolInputSchemas ? true : never
type _ValidateFileReadInput = FileReadInput extends ToolInputSchemas ? true : never
type _ValidateFileWriteInput = FileWriteInput extends ToolInputSchemas ? true : never
type _ValidateGlobInput = GlobInput extends ToolInputSchemas ? true : never
type _ValidateGrepInput = GrepInput extends ToolInputSchemas ? true : never
type _ValidateTaskStopInput = TaskStopInput extends ToolInputSchemas ? true : never
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
  | _ValidateExitPlanModeInput
  | _ValidateFileEditInput
  | _ValidateFileReadInput
  | _ValidateFileWriteInput
  | _ValidateGlobInput
  | _ValidateGrepInput
  | _ValidateTaskStopInput
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
  "TaskOutput",
  "ExitPlanMode",
  "Edit",
  "Read",
  "Write",
  "Glob",
  "Grep",
  "TaskStop",
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
 * Compile-time checks for shared registry <-> SDK alignment.
 */
type _StreamOnlyTools = "Skill" | "BashOutput"
type _MissingInShared = Exclude<SDKToolName, StreamSdkToolName>
const _assertSharedCoversAllSdkTools: _MissingInShared extends never ? true : never = true

type _UnexpectedInShared = Exclude<StreamSdkToolName, SDKToolName | _StreamOnlyTools>
const _assertNoUnexpectedSharedSdkTools: _UnexpectedInShared extends never ? true : never = true
