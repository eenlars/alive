/**
 * Automation Job Executor
 *
 * Runs automation jobs by sending prompts to Claude via worker pool with
 * automatic retry and child process fallback for reliability.
 *
 * Execution strategy:
 * 1. Try worker pool (fast, pre-warmed)
 * 2. On transient failure (disconnect/crash), retry once after 2s delay
 * 3. If worker pool still fails, fall back to child process runner
 *
 * Uses OAuth credentials from ~/.claude/.credentials.json when org has credits,
 * same as the main chat flow.
 */

import { statSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"
import { DEFAULTS, WORKER_POOL } from "@webalive/shared"
import { getSkillById, listGlobalSkills, type SkillListItem } from "@webalive/tools"
import { getSystemPrompt } from "@/features/chat/lib/systemPrompt"
import { resolveWorkspace as resolveWorkspacePath } from "@/features/workspace/lib/workspace-secure"
import { getValidAccessToken, hasOAuthCredentials } from "@/lib/anthropic-oauth"
import {
  getAllowedTools,
  getDisallowedTools,
  PERMISSION_MODE,
  SETTINGS_SOURCES,
  STREAM_TYPES,
} from "@/lib/claude/agent-constants.mjs"
import { getOrgCredits } from "@/lib/credits/supabase-credits"
import { DEFAULT_MODEL } from "@/lib/models/claude-models"
import { generateRequestId } from "@/lib/utils"
import { runAgentChild } from "@/lib/workspace-execution/agent-child-runner"

/** Errors that indicate transient worker pool issues worth retrying */
const TRANSIENT_WORKER_ERRORS = [
  "Worker disconnected unexpectedly",
  "crashed before becoming ready",
  "Worker spawn error",
  "Worker exited",
  "Socket connection timed out",
]

function isTransientWorkerError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  return TRANSIENT_WORKER_ERRORS.some(pattern => msg.includes(pattern))
}

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
}

/**
 * Load skill prompts by IDs and combine them into a single context block
 */
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

  // Format skills as context blocks
  const skillBlocks = loadedSkills.map(skill => `<skill name="${skill.displayName}">\n${skill.prompt}\n</skill>`)

  return `The following skills have been loaded to guide your work:\n\n${skillBlocks.join("\n\n")}`
}

export interface AutomationJobResult {
  success: boolean
  durationMs: number
  error?: string
  response?: string
  /** Full Claude SDK message stream for logging/debugging */
  messages?: unknown[]
}

// =============================================================================
// Worker Pool Query (with error capture instead of throw)
// =============================================================================

interface WorkerPoolParams {
  requestId: string
  cwd: string
  workspace: string
  userId: string
  fullPrompt: string
  selectedModel: string
  systemPrompt: string
  timeoutSeconds: number
  onMessage: (msg: Record<string, unknown>) => void
}

/**
 * Try executing via worker pool. Returns null on success, or the error on failure.
 */
async function tryWorkerPool(params: WorkerPoolParams): Promise<Error | null> {
  const { requestId, cwd, workspace, userId, fullPrompt, selectedModel, systemPrompt, timeoutSeconds, onMessage } =
    params

  try {
    const { getWorkerPool } = await import("@webalive/worker-pool")

    const st = statSync(cwd)
    const credentials = {
      uid: st.uid,
      gid: st.gid,
      cwd,
      workspaceKey: workspace,
    }

    const allowedTools = getAllowedTools(cwd, false, false)
    const disallowedTools = getDisallowedTools(false, false)

    const agentConfig = {
      allowedTools,
      disallowedTools,
      permissionMode: PERMISSION_MODE,
      settingSources: SETTINGS_SOURCES,
      oauthMcpServers: {} as Record<string, unknown>,
      bridgeStreamTypes: STREAM_TYPES,
      isAdmin: false,
      isSuperadmin: false,
    }

    const pool = getWorkerPool()
    const abortController = new AbortController()
    const timeoutId = setTimeout(() => abortController.abort(), timeoutSeconds * 1000)

    try {
      await pool.query(credentials, {
        requestId,
        ownerKey: userId,
        workloadClass: "automation",
        payload: {
          message: fullPrompt,
          model: selectedModel,
          maxTurns: DEFAULTS.CLAUDE_MAX_TURNS,
          systemPrompt,
          oauthTokens: {},
          userEnvKeys: {},
          agentConfig,
        },
        onMessage: (msg: Record<string, unknown>) => {
          console.log(`[Automation ${requestId}] Message:`, JSON.stringify(msg).substring(0, 500))
          onMessage(msg)
        },
        signal: abortController.signal,
      })
      return null // Success
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error))
  }
}

// =============================================================================
// Child Process Runner (reliable fallback)
// =============================================================================

interface ChildProcessParams {
  requestId: string
  cwd: string
  fullPrompt: string
  selectedModel: string
  systemPrompt: string
  timeoutSeconds: number
  apiKey: string
  allMessages: unknown[]
  textMessages: string[]
  onFinalResponse: (text: string) => void
}

async function runChildProcess(params: ChildProcessParams): Promise<void> {
  const {
    requestId,
    cwd,
    fullPrompt,
    selectedModel,
    systemPrompt,
    timeoutSeconds,
    apiKey,
    allMessages,
    textMessages,
    onFinalResponse,
  } = params

  console.log(`[Automation ${requestId}] Using child process runner`)

  const childStream = runAgentChild(cwd, {
    message: fullPrompt,
    model: selectedModel,
    maxTurns: DEFAULTS.CLAUDE_MAX_TURNS,
    systemPrompt,
    apiKey,
    isAdmin: false,
    isSuperadmin: false,
  })

  const reader = childStream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error("Automation timeout")), timeoutSeconds * 1000)
  })

  const readPromise = (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          allMessages.push(msg)

          if (msg.role === "assistant" && Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === "text") {
                textMessages.push(block.text)
              }
            }
          }
          if (msg.type === "result" && msg.data?.resultText) {
            onFinalResponse(msg.data.resultText)
          }
        } catch {
          // Skip non-JSON lines
        }
      }
    }
  })()

  await Promise.race([readPromise, timeoutPromise])
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Run an automation job (pure execution, no DB side effects)
 *
 * This function:
 * 1. Validates workspace, credits, and OAuth
 * 2. Sends the prompt to Claude via worker pool (with retry) or child process fallback
 * 3. Collects the response
 *
 * Callers (CronService, trigger routes) own all DB state updates.
 */
export async function runAutomationJob(params: AutomationJobParams): Promise<AutomationJobResult> {
  const { jobId, workspace, prompt, timeoutSeconds = 300, model, thinkingPrompt, skills } = params
  const requestId = generateRequestId()
  const startTime = Date.now()

  // === PHASE 1: Input Validation ===
  if (!workspace?.trim()) {
    return {
      success: false,
      durationMs: 0,
      error: "Workspace hostname is required",
    }
  }

  if (!prompt?.trim()) {
    return {
      success: false,
      durationMs: 0,
      error: "Automation prompt cannot be empty",
    }
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

  // Build the full prompt with skill context prepended
  const fullPrompt = skillContext
    ? `${skillContext}\n\n---\n\nNow, please complete the following task:\n\n${prompt}`
    : prompt

  // Track messages outside try block so we can log partial results on failure
  const allMessages: unknown[] = []

  try {
    // === PHASE 2: Workspace Validation ===
    // resolveWorkspacePath() throws if /user/src directory doesn't exist
    let cwd: string
    try {
      cwd = resolveWorkspacePath(workspace)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      if (errorMsg.includes("ENOENT") || errorMsg.includes("no such file")) {
        throw new Error(
          `Site "${workspace}" is not properly deployed. The required directory structure (/user/src) is missing. ` +
            "The site may need to be redeployed. Please check that the site deployment completed successfully.",
        )
      }
      if (errorMsg.includes("escaped")) {
        throw new Error(`Invalid workspace path for "${workspace}". This is a security error - contact support.`)
      }
      throw new Error(`Failed to access workspace "${workspace}": ${errorMsg}`)
    }

    if (!cwd) {
      throw new Error(
        `Site not found: "${workspace}". Verify that the site exists and is accessible. Check your workspace configuration.`,
      )
    }

    console.log(`[Automation ${requestId}] Workspace: ${cwd}`)

    // === PHASE 3: Credits Validation ===
    // Check credits and OAuth credentials
    // DON'T pass apiKey - let Claude Code read ~/.claude/.credentials.json directly
    // This is the same as the main chat flow
    const orgCredits = (await getOrgCredits(workspace)) ?? 0
    const COST_ESTIMATE = 1 // Minimum credits required per automation run

    if (orgCredits < COST_ESTIMATE) {
      throw new Error(
        `Insufficient credits: You have ${orgCredits} credit(s) but need ${COST_ESTIMATE}. Please upgrade your plan to continue using automations.`,
      )
    }

    // === PHASE 4: OAuth Validation ===
    if (!hasOAuthCredentials()) {
      throw new Error(
        "No OAuth credentials found. Please authenticate with Anthropic in settings before running automations.",
      )
    }

    // Ensure token is fresh (refresh if needed)
    const oauthResult = await getValidAccessToken()
    if (!oauthResult) {
      throw new Error("Failed to refresh authentication token. Please re-authenticate in settings and try again.")
    }
    console.log(`[Automation ${requestId}] OAuth ready (refreshed: ${oauthResult.refreshed})`)

    // Build system prompt for automation context
    const automationContext = thinkingPrompt
      ? `This is an automated task triggered by a scheduled automation.\n\nAgent guidance: ${thinkingPrompt}\n\nComplete the task efficiently and report what was done.`
      : "This is an automated task triggered by a scheduled automation. The automation name is associated with this workspace. Complete the task efficiently and report what was done."

    const systemPrompt = getSystemPrompt({
      workspaceFolder: cwd,
      hasStripeMcpAccess: false,
      hasGmailAccess: false,
      isProduction: false,
      additionalContext: automationContext,
    })

    // Use specified model or default
    const selectedModel = model || DEFAULT_MODEL

    // Collect messages (text only for response assembly)
    const textMessages: string[] = []
    let finalResponse = ""

    // Message handler shared between worker pool and child process modes
    const collectWorkerMessage = (msg: Record<string, unknown>) => {
      // Store ALL messages for full conversation log
      if (msg.type === "message" && "content" in msg) {
        allMessages.push(msg.content)

        const content = msg.content as Record<string, unknown>
        // Check both direct content and nested content structure
        if (content.role === "assistant" && Array.isArray(content.content)) {
          for (const block of content.content) {
            if (block.type === "text") {
              textMessages.push(block.text)
            }
          }
        }
        // Also check for messageType === "assistant" with nested content
        if (content.messageType === "assistant" && (content.content as Record<string, unknown>)?.content) {
          for (const block of (content.content as Record<string, unknown>).content as Array<Record<string, unknown>>) {
            if (block.type === "text") {
              textMessages.push(block.text as string)
            }
          }
        }
      } else if (msg.type === "complete" && "result" in msg) {
        const result = msg.result as Record<string, unknown>
        const nested = result.result as Record<string, unknown> | undefined
        if (nested?.subtype === "success") {
          const data = nested.data as Record<string, unknown> | undefined
          if (data?.resultText) finalResponse = data.resultText as string
        } else {
          const data = result.data as Record<string, unknown> | undefined
          if (result.type === "result" && data?.resultText) {
            finalResponse = data.resultText as string
          }
        }
      }
    }

    // === PHASE 5: Execute via worker pool with retry + child process fallback ===
    const workerPoolEnabled = WORKER_POOL.ENABLED
    let usedChildProcess = false

    if (workerPoolEnabled) {
      const workerPoolError = await tryWorkerPool({
        requestId,
        cwd,
        workspace,
        userId: params.userId,
        fullPrompt,
        selectedModel,
        systemPrompt,
        timeoutSeconds,
        onMessage: collectWorkerMessage,
      })

      if (workerPoolError && isTransientWorkerError(workerPoolError)) {
        // Transient failure — retry once after a brief delay
        console.warn(
          `[Automation ${requestId}] Worker pool failed (transient): ${workerPoolError.message}. Retrying in 2s...`,
        )
        await sleep(2000)

        const retryError = await tryWorkerPool({
          requestId: `${requestId}-retry`,
          cwd,
          workspace,
          userId: params.userId,
          fullPrompt,
          selectedModel,
          systemPrompt,
          timeoutSeconds,
          onMessage: collectWorkerMessage,
        })

        if (retryError) {
          // Retry also failed — fall back to child process
          console.warn(
            `[Automation ${requestId}] Worker pool retry failed: ${retryError.message}. Falling back to child process.`,
          )
          await runChildProcess({
            requestId,
            cwd,
            fullPrompt,
            selectedModel,
            systemPrompt,
            timeoutSeconds,
            apiKey: oauthResult.accessToken,
            allMessages,
            textMessages,
            onFinalResponse: (text: string) => {
              finalResponse = text
            },
          })
          usedChildProcess = true
        }
      } else if (workerPoolError) {
        // Non-transient error (e.g., validation) — fall back immediately
        console.warn(
          `[Automation ${requestId}] Worker pool failed (non-transient): ${workerPoolError.message}. Using child process.`,
        )
        await runChildProcess({
          requestId,
          cwd,
          fullPrompt,
          selectedModel,
          systemPrompt,
          timeoutSeconds,
          apiKey: oauthResult.accessToken,
          allMessages,
          textMessages,
          onFinalResponse: (text: string) => {
            finalResponse = text
          },
        })
        usedChildProcess = true
      }
    } else {
      // Worker pool disabled — use child process directly
      console.log(`[Automation ${requestId}] Using child process runner (worker pool not enabled)`)
      await runChildProcess({
        requestId,
        cwd,
        fullPrompt,
        selectedModel,
        systemPrompt,
        timeoutSeconds,
        apiKey: oauthResult.accessToken,
        allMessages,
        textMessages,
        onFinalResponse: (text: string) => {
          finalResponse = text
        },
      })
      usedChildProcess = true
    }

    const durationMs = Date.now() - startTime

    // Use final response or concatenate text messages
    const response = finalResponse || textMessages.join("\n\n")
    const mode = usedChildProcess ? "child-process" : "worker-pool"

    console.log(
      `[Automation ${requestId}] Completed in ${durationMs}ms via ${mode}, ${allMessages.length} messages captured`,
    )

    return {
      success: true,
      durationMs,
      response,
      messages: allMessages,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    console.error(`[Automation ${requestId}] Failed after ${durationMs}ms:`, errorMessage)

    return {
      success: false,
      durationMs,
      error: errorMessage,
      messages: allMessages.length > 0 ? allMessages : undefined,
    }
  }
}
