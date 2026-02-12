/**
 * Worker Executor
 *
 * Runs automation prompts using Claude Agent SDK directly (in-process).
 * No worker pool, no child process — simpler and survives web deploys.
 *
 * Uses the same SDK query() as the child process runner and worker pool,
 * but without privilege dropping (runs as the worker's user).
 */

import { existsSync } from "node:fs"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { allowTool, DEFAULTS, denyTool } from "@webalive/shared"
import { getWorkspacePath } from "@webalive/shared"
import { getSkillById, listGlobalSkills, type SkillListItem } from "@webalive/tools"
import { getAccessToken } from "./oauth"

// =============================================================================
// Types
// =============================================================================

export interface ExecutorParams {
  jobId: string
  userId: string
  orgId: string
  workspace: string
  prompt: string
  timeoutSeconds?: number
  model?: string
  thinkingPrompt?: string
  skills?: string[]
}

export interface ExecutorResult {
  success: boolean
  durationMs: number
  error?: string
  response?: string
  messages?: unknown[]
}

// =============================================================================
// Allowed tools for automations (safe subset — no MCP, no subagents)
// =============================================================================

const AUTOMATION_ALLOWED_TOOLS: string[] = [
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "Bash",
  "TaskOutput",
  "NotebookEdit",
  "WebFetch",
]

const AUTOMATION_DISALLOWED_TOOLS: string[] = ["Task", "WebSearch", "ExitPlanMode", "AskUserQuestion", "Skill"]

// =============================================================================
// Skills
// =============================================================================

async function loadSkillPrompts(skillIds: string[]): Promise<string | null> {
  if (!skillIds || skillIds.length === 0) return null

  const globalSkills = await listGlobalSkills()
  const loaded: SkillListItem[] = []

  for (const id of skillIds) {
    const skill = getSkillById(globalSkills, id)
    if (skill) loaded.push(skill)
    else console.warn(`[Worker Executor] Skill not found: ${id}`)
  }

  if (loaded.length === 0) return null

  const blocks = loaded.map(s => `<skill name="${s.displayName}">\n${s.prompt}\n</skill>`)
  return `The following skills have been loaded to guide your work:\n\n${blocks.join("\n\n")}`
}

// =============================================================================
// System Prompt
// =============================================================================

function buildSystemPrompt(cwd: string, thinkingPrompt?: string): string {
  const now = new Date()
  let prompt = `Current time: ${now.toISOString()}. Workspace: ${cwd}.`
  prompt += " This is an automated task — no human is watching. Complete it efficiently and report what was done."
  prompt +=
    " Use Bash for shell commands (e.g. date, curl). Use Write/Edit for file changes. Use parallel tool calls when possible."

  if (thinkingPrompt) {
    prompt += `\n\nAgent guidance: ${thinkingPrompt}`
  }

  return prompt
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run an automation job using Claude Agent SDK directly.
 * Pure execution — no DB side effects.
 */
export async function runAutomationJob(params: ExecutorParams): Promise<ExecutorResult> {
  const { jobId, workspace, prompt, timeoutSeconds = 300, model, thinkingPrompt, skills } = params
  const startTime = Date.now()

  // Input validation
  if (!workspace?.trim()) {
    return { success: false, durationMs: 0, error: "Workspace hostname is required" }
  }
  if (!prompt?.trim()) {
    return { success: false, durationMs: 0, error: "Automation prompt cannot be empty" }
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) {
    return { success: false, durationMs: 0, error: `Invalid timeout: ${timeoutSeconds}` }
  }

  console.log(`[Worker Executor] Starting job ${jobId} for ${workspace} (timeout: ${timeoutSeconds}s)`)

  // Load skill prompts
  const skillContext = await loadSkillPrompts(skills ?? [])
  const fullPrompt = skillContext
    ? `${skillContext}\n\n---\n\nNow, please complete the following task:\n\n${prompt}`
    : prompt

  try {
    // Workspace validation
    const cwd = getWorkspacePath(workspace)
    if (!existsSync(cwd)) {
      throw new Error(`Site "${workspace}" workspace missing (${cwd}). May need redeployment.`)
    }

    // OAuth token
    const apiKey = await getAccessToken()
    if (!apiKey) {
      throw new Error("No valid OAuth credentials. Please authenticate in settings.")
    }

    // Set API key in env for SDK
    process.env.ANTHROPIC_API_KEY = apiKey

    // Build system prompt
    const systemPrompt = buildSystemPrompt(cwd, thinkingPrompt)

    // Permission handler — simple allow/deny
    const canUseTool: import("@anthropic-ai/claude-agent-sdk").CanUseTool = async (toolName, input) => {
      if (AUTOMATION_DISALLOWED_TOOLS.includes(toolName)) {
        return denyTool(`Tool "${toolName}" is not available for automations.`)
      }
      if (AUTOMATION_ALLOWED_TOOLS.includes(toolName)) {
        return allowTool(input)
      }
      return denyTool(`Tool "${toolName}" is not permitted.`)
    }

    // Execute via SDK
    const abort = new AbortController()
    const timeoutId = setTimeout(() => abort.abort(), timeoutSeconds * 1000)

    const textMessages: string[] = []
    const allMessages: unknown[] = []
    let resultText = ""

    try {
      const agentQuery = query({
        prompt: fullPrompt,
        options: {
          cwd,
          model: model ?? DEFAULTS.CLAUDE_MODEL,
          maxTurns: DEFAULTS.CLAUDE_MAX_TURNS,
          permissionMode: "bypassPermissions",
          allowDangerouslySkipPermissions: true,
          allowedTools: AUTOMATION_ALLOWED_TOOLS,
          disallowedTools: AUTOMATION_DISALLOWED_TOOLS,
          canUseTool,
          systemPrompt,
          abortController: abort,
        },
      })

      for await (const message of agentQuery) {
        allMessages.push(message)

        // Extract text from assistant messages
        if (message.type === "assistant") {
          const content = message.message?.content
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "text") {
                textMessages.push(block.text)
              }
            }
          }
        }

        // Capture final result
        if (message.type === "result" && message.subtype === "success") {
          resultText = message.result
        }
      }
    } finally {
      clearTimeout(timeoutId)
    }

    const durationMs = Date.now() - startTime
    const response = resultText || textMessages.join("\n\n")

    console.log(`[Worker Executor] Job ${jobId} completed in ${durationMs}ms, ${allMessages.length} messages`)
    return { success: true, durationMs, response, messages: allMessages }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[Worker Executor] Job ${jobId} failed after ${durationMs}ms:`, errorMessage)
    return { success: false, durationMs, error: errorMessage }
  }
}
