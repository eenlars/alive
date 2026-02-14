/**
 * Automation Job Executor
 *
 * Orchestrates automation execution via worker pool only.
 * No child-process fallback path is allowed.
 *
 * Uses OAuth credentials from ~/.claude/.credentials.json when org has credits,
 * same as the main chat flow.
 */

import * as Sentry from "@sentry/nextjs"
import { buildSessionOrgClaims, CLAUDE_MODELS, getWorkspacePath } from "@webalive/shared"
import { getSkillById, listGlobalSkills, type SkillListItem } from "@webalive/tools"
import { createSessionToken } from "@/features/auth/lib/jwt"
import { getValidAccessToken, hasOAuthCredentials } from "@/lib/anthropic-oauth"
import { getOrgCredits } from "@/lib/credits/supabase-credits"
import { createServiceIamClient } from "@/lib/supabase/service"
import { generateRequestId } from "@/lib/utils"
import { type AttemptResult, tryWorkerPool, WORKER_POOL } from "./attempts"

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
  /** Additional MCP tool names to register */
  extraTools?: string[]
  /** Extract response from this tool's input.text */
  responseToolName?: string
  /** Session cookie for authenticating API callbacks (e.g. restart_dev_server) */
  sessionCookie?: string
}

async function executeWithWorkerPoolOnly(ctx: ExecutionContext): Promise<AttemptResult> {
  const { requestId, workspace, userId, sessionCookie, ...sharedParams } = ctx

  if (!WORKER_POOL.ENABLED) {
    throw new Error("Automation execution requires WORKER_POOL.ENABLED=true; no fallback execution path is allowed.")
  }

  return tryWorkerPool({ ...sharedParams, requestId, workspace, userId, sessionCookie })
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

    // === Session Token for API Callbacks ===
    // Automations run server-to-server (no browser cookies), but tools like
    // restart_dev_server call back to the Bridge API which requires a session cookie.
    // Mint a short-lived JWT so the worker process can authenticate these calls.
    let sessionCookie: string | undefined
    try {
      const iam = createServiceIamClient()
      const { data: user, error: userError } = await iam
        .from("users")
        .select("email, display_name")
        .eq("user_id", params.userId)
        .single()

      if (userError) {
        throw new Error(`Failed to load user for session token: ${userError.message}`)
      }

      if (user?.email) {
        const { data: memberships, error: membershipsError } = await iam
          .from("org_memberships")
          .select("org_id, role")
          .eq("user_id", params.userId)

        if (membershipsError) {
          throw new Error(`Failed to load org memberships for session token: ${membershipsError.message}`)
        }

        // Scope token to only the org for this automation job (least privilege)
        const allClaims = buildSessionOrgClaims(memberships)
        const orgIds = allClaims.orgIds.filter(id => id === params.orgId)
        const orgRoles: typeof allClaims.orgRoles = {}
        for (const id of orgIds) {
          if (allClaims.orgRoles[id]) {
            orgRoles[id] = allClaims.orgRoles[id]
          }
        }

        if (orgIds.length > 0) {
          sessionCookie = await createSessionToken({
            userId: params.userId,
            email: user.email,
            name: user.display_name,
            orgIds,
            orgRoles,
          })
        } else {
          console.warn(
            `[Automation ${requestId}] User ${params.userId} has no valid membership for org ${params.orgId} — skipping session token`,
          )
        }
      } else {
        console.warn(`[Automation ${requestId}] Could not find user ${params.userId} for session token`)
      }
    } catch (err) {
      console.warn(`[Automation ${requestId}] Failed to mint session token:`, err)
    }

    // === Build Prompts ===
    const systemPrompt = params.systemPromptOverride ?? buildDefaultSystemPrompt(cwd, thinkingPrompt)

    // === Execute ===
    const attempt = await executeWithWorkerPoolOnly({
      requestId,
      cwd,
      workspace,
      userId: params.userId,
      fullPrompt,
      selectedModel: model || CLAUDE_MODELS.OPUS_4_6,
      systemPrompt,
      timeoutSeconds,
      extraTools: params.extraTools,
      responseToolName: params.responseToolName,
      sessionCookie,
    })

    const durationMs = Date.now() - startTime

    // When responseToolName is set, the tool MUST have been called
    let response: string
    if (params.responseToolName) {
      if (!attempt.toolResponseText) {
        throw new Error(
          `Automation expected tool "${params.responseToolName}" but it was never called. ` +
            "Check extraTools and MCP server configuration.",
        )
      }
      response = attempt.toolResponseText
    } else {
      response = attempt.finalResponse || attempt.textMessages.join("\n\n")
    }

    console.log(
      `[Automation ${requestId}] Completed in ${durationMs}ms via worker-pool, ${attempt.allMessages.length} messages captured`,
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
