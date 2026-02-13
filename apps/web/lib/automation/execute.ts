/**
 * Automation Job Executor (web-specific)
 *
 * Thin wrapper around the executor module that bridges RunContext → runAutomationJob.
 * Lives in the web app because it depends on web-specific imports (OAuth, worker pool).
 *
 * For the claim/finish lifecycle, use @webalive/automation-engine directly.
 */

import type { RunContext } from "@webalive/automation-engine"

/**
 * Execute a claimed job. Pure execution — calls runAutomationJob.
 * Returns the result without touching DB state (that's finishJob's job).
 */
export async function executeJob(ctx: RunContext): Promise<{
  success: boolean
  durationMs: number
  error?: string
  response?: string
  messages?: unknown[]
  costUsd?: number
  numTurns?: number
  usage?: { input_tokens: number; output_tokens: number }
}> {
  const startTime = Date.now()

  try {
    const { runAutomationJob } = await import("./executor")
    const result = await runAutomationJob({
      jobId: ctx.job.id,
      userId: ctx.job.user_id,
      orgId: ctx.job.org_id,
      workspace: ctx.hostname,
      prompt: ctx.promptOverride ?? ctx.job.action_prompt ?? "",
      timeoutSeconds: ctx.timeoutSeconds,
      model: ctx.job.action_model ?? undefined,
      thinkingPrompt: ctx.job.action_thinking ?? undefined,
      skills: ctx.job.skills ?? undefined,
      systemPromptOverride: ctx.systemPromptOverride,
      extraTools: ctx.extraTools,
      responseToolName: ctx.responseToolName,
    })

    return {
      success: result.success,
      durationMs: result.durationMs,
      error: result.error,
      response: result.response,
      messages: result.messages,
      costUsd: result.costUsd,
      numTurns: result.numTurns,
      usage: result.usage,
    }
  } catch (error) {
    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
