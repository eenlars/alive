/**
 * Automation Job Executor
 *
 * Orchestrates automation execution with retry and fallback:
 * 1. Try worker pool (fast, pre-warmed)
 * 2. On transient failure (disconnect/crash), retry once after 2s delay
 * 3. If worker pool still fails, fall back to child process runner
 *
 * Each attempt is fully isolated — only the successful attempt's data is used.
 *
 * Uses OAuth credentials from ~/.claude/.credentials.json when org has credits,
 * same as the main chat flow.
 */

import { setTimeout as sleep } from "node:timers/promises"
import * as Sentry from "@sentry/nextjs"
import { CLAUDE_MODELS, getWorkspacePath } from "@webalive/shared"
import { getSkillById, listGlobalSkills, type SkillListItem } from "@webalive/tools"
import { getValidAccessToken, hasOAuthCredentials } from "@/lib/anthropic-oauth"
import { getOrgCredits } from "@/lib/credits/supabase-credits"
import { generateRequestId } from "@/lib/utils"
import { type AttemptResult, classifyFailure, runChildProcess, tryWorkerPool, WORKER_POOL } from "./attempts"

function safeJsonForLog(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '"[unserializable]"'
  }
}

function extractDiagnostics(error: unknown): unknown {
  if (!error || typeof error !== "object" || !("diagnostics" in error)) return undefined
  return (error as { diagnostics?: unknown }).diagnostics
}

// =============================================================================
// Public Types
// =============================================================================

export interface AutomationJobParams {
  jobId: string
  userId: string
  orgId: string
  workspace: string // hostname like "zomaar.sonno.tech"
  prompt: string
  timeoutSeconds?: number
  /** Optional model override (e.g., "claude-sonnet-4-20250514") */
  model?: string
  /** Optional thinking prompt for agent guidance */
  thinkingPrompt?: string
  /** Skill IDs to load and prepend to prompt */
  skills?: string[]
  /** Custom system prompt — replaces default automation system prompt entirely */
  systemPromptOverride?: string
  /** Additional MCP tool names to register (e.g. ["mcp__alive-email__send_reply"]) */
  extraTools?: string[]
  /** Extract response from this tool's input.text instead of text messages */
  responseToolName?: string
}

export interface AutomationJobResult {
  success: boolean
  durationMs: number
  error?: string
  response?: string
  /** Full Claude SDK message stream for logging/debugging */
  messages?: unknown[]
  costUsd?: number
  numTurns?: number
  usage?: { input_tokens: number; output_tokens: number }
}

// =============================================================================
// Skills
// =============================================================================

async function loadSkillPrompts(skillIds: string[]): Promise<string | null> {
  if (!skillIds || skillIds.length === 0) return null

  const globalSkills = await listGlobalSkills()
  const loadedSkills: SkillListItem[] = []

  for (const skillId of skillIds) {
    const skill = getSkillById(globalSkills, skillId)
    if (skill) {
      loadedSkills.push(skill)
    } else {
      console.warn(`[Automation] Skill not found: ${skillId}`)
    }
  }

  if (loadedSkills.length === 0) return null

  const skillBlocks = loadedSkills.map(skill => `<skill name="${skill.displayName}">\n${skill.prompt}\n</skill>`)
  return `The following skills have been loaded to guide your work:\n\n${skillBlocks.join("\n\n")}`
}

// =============================================================================
// System Prompt
// =============================================================================

/**
 * Build the default system prompt for automation execution.
 * Unlike the chat system prompt, this skips "Read CLAUDE.md" and workflow instructions
 * since automations run unattended and need to act directly.
 *
 * Callers can bypass this entirely via systemPromptOverride (e.g. email triggers
 * provide their own character-specific system prompt).
 */
function buildDefaultSystemPrompt(cwd: string, thinkingPrompt?: string): string {
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
// Execution Strategy
// =============================================================================

interface ExecutionContext {
  requestId: string
  cwd: string
  workspace: string
  userId: string
  fullPrompt: string
  selectedModel: string
  systemPrompt: string
  timeoutSeconds: number
  apiKey: string
  /** Additional MCP tool names to register */
  extraTools?: string[]
  /** Extract response from this tool's input.text */
  responseToolName?: string
}

async function executeWithFallback(
  ctx: ExecutionContext,
): Promise<{ attempt: AttemptResult; mode: "worker-pool" | "child-process" }> {
  const { requestId, workspace, userId, apiKey, ...sharedParams } = ctx

  if (!WORKER_POOL.ENABLED) {
    console.log(`[Automation ${requestId}] Worker pool disabled, using child process`)
    const attempt = await runChildProcess({ ...sharedParams, requestId, apiKey })
    return { attempt, mode: "child-process" }
  }

  // First attempt: worker pool
  try {
    const attempt = await tryWorkerPool({ ...sharedParams, requestId, workspace, userId })
    return { attempt, mode: "worker-pool" }
  } catch (firstError) {
    const failure = classifyFailure(firstError)
    console.warn(`[Automation ${requestId}] Worker pool failed (${failure.kind}): ${failure.message}`)
    const firstDiagnostics = extractDiagnostics(firstError)
    if (firstDiagnostics) {
      console.warn(`[Automation ${requestId}] Worker diagnostics: ${safeJsonForLog(firstDiagnostics)}`)
    }

    if (failure.transient) {
      console.log(`[Automation ${requestId}] Retrying worker pool in 2s...`)
      await sleep(2000)

      try {
        const attempt = await tryWorkerPool({
          ...sharedParams,
          requestId: `${requestId}-retry`,
          workspace,
          userId,
        })
        return { attempt, mode: "worker-pool" }
      } catch (retryError) {
        const retryFailure = classifyFailure(retryError)
        console.warn(
          `[Automation ${requestId}] Retry failed (${retryFailure.kind}): ${retryFailure.message}. Falling back to child process.`,
        )
        const retryDiagnostics = extractDiagnostics(retryError)
        if (retryDiagnostics) {
          console.warn(`[Automation ${requestId}] Retry diagnostics: ${safeJsonForLog(retryDiagnostics)}`)
        }
      }
    }

    // Non-transient or retry exhausted — child process fallback
    console.log(`[Automation ${requestId}] Falling back to child process.`)
    const attempt = await runChildProcess({ ...sharedParams, requestId, apiKey })
    return { attempt, mode: "child-process" }
  }
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run an automation job (pure execution, no DB side effects).
 * Callers (CronService, trigger routes) own all DB state updates.
 */
export async function runAutomationJob(params: AutomationJobParams): Promise<AutomationJobResult> {
  const { jobId, workspace, prompt, timeoutSeconds = 300, model, thinkingPrompt, skills } = params
  const requestId = generateRequestId()
  const startTime = Date.now()

  // === Input Validation ===
  if (!workspace?.trim()) {
    return { success: false, durationMs: 0, error: "Workspace hostname is required" }
  }
  if (!prompt?.trim()) {
    return { success: false, durationMs: 0, error: "Automation prompt cannot be empty" }
  }
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 3600) {
    return {
      success: false,
      durationMs: 0,
      error: `Invalid timeout: ${timeoutSeconds}. Must be between 1 and 3600 seconds (1 hour).`,
    }
  }

  console.log(`[Automation ${requestId}] Starting job ${jobId} for ${workspace} (timeout: ${timeoutSeconds}s)`)

  // Load skill prompts if specified
  const skillIds = skills ?? []
  const skillContext = await loadSkillPrompts(skillIds)
  if (skillContext) {
    console.log(`[Automation ${requestId}] Loaded ${skillIds.length} skill(s)`)
  }

  const fullPrompt = skillContext
    ? `${skillContext}\n\n---\n\nNow, please complete the following task:\n\n${prompt}`
    : prompt

  try {
    // === Workspace Validation ===
    // Use getWorkspacePath (resolves to /user, same as chat flow).
    // workspace-secure.ts resolves to /user/src which breaks sites without src/.
    const cwd = getWorkspacePath(workspace)

    // Verify the directory actually exists
    const { existsSync } = await import("node:fs")
    if (!existsSync(cwd)) {
      throw new Error(
        `Site "${workspace}" is not properly deployed. The workspace directory is missing (${cwd}). ` +
          "The site may need to be redeployed. Please check that the site deployment completed successfully.",
      )
    }

    console.log(`[Automation ${requestId}] Workspace: ${cwd}`)

    // === Credits Validation ===
    const orgCredits = (await getOrgCredits(workspace)) ?? 0
    if (orgCredits < 1) {
      throw new Error(
        `Insufficient credits: You have ${orgCredits} credit(s) but need 1. Please upgrade your plan to continue using automations.`,
      )
    }

    // === OAuth Validation ===
    if (!hasOAuthCredentials()) {
      throw new Error(
        "No OAuth credentials found. Please authenticate with Anthropic in settings before running automations.",
      )
    }

    const oauthResult = await getValidAccessToken()
    if (!oauthResult) {
      throw new Error("Failed to refresh authentication token. Please re-authenticate in settings and try again.")
    }
    console.log(`[Automation ${requestId}] OAuth ready (refreshed: ${oauthResult.refreshed})`)

    // === Build Prompts ===
    const systemPrompt = params.systemPromptOverride ?? buildDefaultSystemPrompt(cwd, thinkingPrompt)

    // === Execute ===
    const { attempt, mode } = await executeWithFallback({
      requestId,
      cwd,
      workspace,
      userId: params.userId,
      fullPrompt,
      selectedModel: model || CLAUDE_MODELS.OPUS_4_6,
      systemPrompt,
      timeoutSeconds,
      apiKey: oauthResult.accessToken,
      extraTools: params.extraTools,
      responseToolName: params.responseToolName,
    })

    const durationMs = Date.now() - startTime
    // When responseToolName is set, prefer tool response over text messages
    const response = params.responseToolName
      ? (attempt.toolResponseText ?? attempt.finalResponse ?? attempt.textMessages.join("\n\n"))
      : attempt.finalResponse || attempt.textMessages.join("\n\n")

    console.log(
      `[Automation ${requestId}] Completed in ${durationMs}ms via ${mode}, ${attempt.allMessages.length} messages captured`,
    )

    return {
      success: true,
      durationMs,
      response,
      messages: attempt.allMessages,
      costUsd: attempt.costUsd,
      numTurns: attempt.numTurns,
      usage: attempt.usage,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error(`[Automation ${requestId}] Failed after ${durationMs}ms:`, errorMessage)
    Sentry.withScope(scope => {
      scope.setTag("category", "automation")
      scope.setTag("requestId", requestId)
      scope.setTag("workspace", workspace)
      scope.setTag("jobId", jobId)
      scope.setContext("automation", { workspace, jobId, durationMs, model })
      Sentry.captureException(error instanceof Error ? error : new Error(errorMessage))
    })

    return { success: false, durationMs, error: errorMessage }
  }
}
