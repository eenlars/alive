/**
 * Automation Job Executor
 *
 * Runs automation jobs by sending prompts to Claude via worker pool or child process.
 * This is a simplified version of the main Claude stream endpoint,
 * designed for background automation without SSE streaming.
 *
 * Uses OAuth credentials from ~/.claude/.credentials.json when org has credits,
 * same as the main chat flow. Falls back to ANTH_API_SECRET if OAuth unavailable.
 */

import { statSync } from "node:fs"
import { resolve } from "node:path"
import { DEFAULTS, PATHS, WORKER_POOL, getWorkspacePath, isPathWithinWorkspace } from "@webalive/shared"
import { createClient } from "@supabase/supabase-js"
import { computeNextRunAtMs } from "@webalive/automation"
import { getSkillById, listGlobalSkills, type SkillListItem } from "@webalive/tools"
import { getValidAccessToken, hasOAuthCredentials } from "@/lib/anthropic-oauth"
import { getOrgCredits } from "@/lib/credits/supabase-credits"
import { getSystemPrompt } from "@/features/chat/lib/systemPrompt"
import {
  STREAM_TYPES,
  getAllowedTools,
  getDisallowedTools,
  PERMISSION_MODE,
  SETTINGS_SOURCES,
} from "@/lib/claude/agent-constants.mjs"
import { getSupabaseCredentials } from "@/lib/env/server"
import { DEFAULT_MODEL } from "@/lib/models/claude-models"
import { generateRequestId } from "@/lib/utils"
import { runAgentChild } from "@/lib/workspace-execution/agent-child-runner"

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

/**
 * Run an automation job
 *
 * This function:
 * 1. Marks the job as running in the database
 * 2. Sends the prompt to Claude via worker pool
 * 3. Collects the response
 * 4. Updates the job status in the database
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

  const { url, key } = getSupabaseCredentials("service")
  const supabase = createClient(url, key, { db: { schema: "app" } })

  // Fetch job details for schedule info (needed to compute next_run_at)
  const { data: jobData } = await supabase
    .from("automation_jobs")
    .select("trigger_type, cron_schedule, cron_timezone, run_at, skills")
    .eq("id", jobId)
    .single()

  // Load skill prompts if specified
  const skillIds = skills ?? (jobData?.skills as string[] | null) ?? []
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
    // Mark job as running
    await supabase.from("automation_jobs").update({ running_at: new Date().toISOString() }).eq("id", jobId)

    // === PHASE 2: Workspace Validation ===
    // Use the same workspace path as the normal chat flow: /srv/webalive/sites/<domain>/user
    // NOT /user/src (which is too restrictive — Claude needs access to server.ts, package.json, etc.)
    const cwd = getWorkspacePath(workspace)
    const resolvedCwd = resolve(cwd)
    const resolvedSitesRoot = resolve(PATHS.SITES_ROOT)

    if (!isPathWithinWorkspace(resolvedCwd, resolvedSitesRoot)) {
      throw new Error("Path traversal attack detected")
    }

    if (!statSync(cwd, { throwIfNoEntry: false })) {
      throw new Error(
        `Site "${workspace}" is not properly deployed. The workspace directory is missing: ${cwd}. ` +
          "The site may need to be redeployed.",
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

    // Use worker pool if enabled, otherwise fall back to child process
    const useWorkerPool = WORKER_POOL.ENABLED

    // Collect messages (text only for response assembly)
    const textMessages: string[] = []
    let finalResponse = ""

    if (useWorkerPool) {
      // === Worker Pool Mode ===
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

      const timeoutId = setTimeout(() => {
        abortController.abort()
      }, timeoutSeconds * 1000)

      try {
        await pool.query(credentials, {
          requestId,
          payload: {
            message: fullPrompt,
            model: selectedModel,
            maxTurns: DEFAULTS.CLAUDE_MAX_TURNS,
            systemPrompt,
            // Don't pass apiKey - worker uses ~/.claude/.credentials.json
            oauthTokens: {},
            userEnvKeys: {},
            agentConfig,
          },
          onMessage: (msg: any) => {
            console.log(`[Automation ${requestId}] Message:`, JSON.stringify(msg).substring(0, 500))

            // Store ALL messages for full conversation log
            if (msg.type === "message" && "content" in msg) {
              allMessages.push(msg.content)

              const content = msg.content as any
              // Check both direct content and nested content structure
              if (content.role === "assistant" && Array.isArray(content.content)) {
                for (const block of content.content) {
                  if (block.type === "text") {
                    textMessages.push(block.text)
                  }
                }
              }
              // Also check for messageType === "assistant" with nested content
              if (content.messageType === "assistant" && content.content?.content) {
                for (const block of content.content.content) {
                  if (block.type === "text") {
                    textMessages.push(block.text)
                  }
                }
              }
            } else if (msg.type === "complete" && "result" in msg) {
              const result = msg.result as any
              if (result.result?.subtype === "success" && result.result?.data?.resultText) {
                finalResponse = result.result.data.resultText
              } else if (result.type === "result" && result.data?.resultText) {
                finalResponse = result.data.resultText
              }
            }
          },
          signal: abortController.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }
    } else {
      // === Child Process Mode (fallback) ===
      console.log(`[Automation ${requestId}] Using child process runner (worker pool not enabled)`)

      const childStream = runAgentChild(cwd, {
        message: fullPrompt,
        model: selectedModel,
        maxTurns: DEFAULTS.CLAUDE_MAX_TURNS,
        systemPrompt,
        // Don't pass apiKey - child process uses ~/.claude/.credentials.json
        isAdmin: false,
        isSuperadmin: false,
      })

      // Read the NDJSON stream and collect messages
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
              // Store ALL messages for full conversation log
              allMessages.push(msg)

              // Extract text from assistant messages
              if (msg.role === "assistant" && Array.isArray(msg.content)) {
                for (const block of msg.content) {
                  if (block.type === "text") {
                    textMessages.push(block.text)
                  }
                }
              }
              // Check for result/complete messages
              if (msg.type === "result" && msg.data?.resultText) {
                finalResponse = msg.data.resultText
              }
            } catch {
              // Skip non-JSON lines
            }
          }
        }
      })()

      await Promise.race([readPromise, timeoutPromise])
    }

    const durationMs = Date.now() - startTime

    // Use final response or concatenate text messages
    const response = finalResponse || textMessages.join("\n\n")

    console.log(`[Automation ${requestId}] Completed in ${durationMs}ms, ${allMessages.length} messages captured`)

    // Compute next run time for cron jobs
    let nextRunAt: string | null = null
    if (jobData?.trigger_type === "cron" && jobData.cron_schedule) {
      const nextMs = computeNextRunAtMs(
        { kind: "cron", expr: jobData.cron_schedule, tz: jobData.cron_timezone || undefined },
        Date.now(),
      )
      if (nextMs) {
        nextRunAt = new Date(nextMs).toISOString()
      }
    }

    // Update job with success
    await supabase
      .from("automation_jobs")
      .update({
        running_at: null,
        last_run_at: new Date(startTime).toISOString(),
        last_run_status: "success",
        last_run_error: null,
        last_run_duration_ms: durationMs,
        next_run_at: nextRunAt,
      })
      .eq("id", jobId)

    // Create run record with full message log
    await supabase.from("automation_runs").insert({
      job_id: jobId,
      started_at: new Date(startTime).toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: durationMs,
      status: "success",
      result: { response: response.substring(0, 10000) }, // Limit stored response size
      messages: allMessages, // Full conversation log
      triggered_by: "manual",
    })

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

    // Compute next run time for cron jobs (even on failure, schedule next attempt)
    let nextRunAt: string | null = null
    if (jobData?.trigger_type === "cron" && jobData.cron_schedule) {
      const nextMs = computeNextRunAtMs(
        { kind: "cron", expr: jobData.cron_schedule, tz: jobData.cron_timezone || undefined },
        Date.now(),
      )
      if (nextMs) {
        nextRunAt = new Date(nextMs).toISOString()
      }
    }

    // Update job with failure
    try {
      await supabase
        .from("automation_jobs")
        .update({
          running_at: null,
          last_run_at: new Date(startTime).toISOString(),
          last_run_status: "failure",
          last_run_error: errorMessage,
          last_run_duration_ms: durationMs,
          next_run_at: nextRunAt,
        })
        .eq("id", jobId)
    } catch (dbError) {
      console.error(`[Automation ${requestId}] Failed to update job status:`, dbError)
    }

    // Create run record with whatever messages we captured before failure
    try {
      await supabase.from("automation_runs").insert({
        job_id: jobId,
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
        status: "failure",
        error: errorMessage,
        messages: allMessages.length > 0 ? allMessages : null, // Include partial log if any
        triggered_by: "manual",
      })
    } catch (dbError) {
      console.error(`[Automation ${requestId}] Failed to create run record:`, dbError)
    }

    return {
      success: false,
      durationMs,
      error: errorMessage,
      messages: allMessages.length > 0 ? allMessages : undefined,
    }
  }
}
