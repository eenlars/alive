/**
 * scheduled_trigger - Manually trigger a scheduled task
 *
 * Run a scheduled task immediately, regardless of its schedule.
 */

import { z } from "zod"
import type { ScheduledToolContext, JobExecutionResult } from "./types.js"
import { getJob } from "./store.js"
import { triggerJob } from "./scheduler.js"

// ============================================
// Schema
// ============================================

export const scheduledTriggerSchema = z.object({
  jobId: z.string().uuid(),
})

export type ScheduledTriggerParams = z.infer<typeof scheduledTriggerSchema>

// ============================================
// Tool Definition
// ============================================

export const scheduledTriggerToolDefinition = {
  name: "scheduled_trigger",
  description: `Manually trigger a scheduled task to run immediately.

This runs the task now, regardless of its normal schedule.
The task's schedule remains unchanged.

Use scheduled_list to find job IDs.`,
  input_schema: {
    type: "object" as const,
    properties: {
      jobId: {
        type: "string",
        description: "The job ID to trigger (UUID)",
      },
    },
    required: ["jobId"],
  },
}

// ============================================
// Execute
// ============================================

export async function executeScheduledTrigger(
  params: ScheduledTriggerParams,
  context: ScheduledToolContext,
): Promise<{ result: JobExecutionResult; message: string }> {
  // Get existing job
  const existing = await getJob(params.jobId)
  if (!existing) {
    throw new Error(`Job not found: ${params.jobId}`)
  }

  // Verify ownership
  if (existing.userId !== context.userId) {
    throw new Error("You can only trigger your own scheduled tasks")
  }

  // Trigger the job
  const result = await triggerJob(params.jobId)
  if (!result) {
    throw new Error("Failed to trigger job")
  }

  const status = result.success ? "completed successfully" : `failed: ${result.error}`
  const duration = `${result.durationMs}ms`

  return {
    result,
    message: `Triggered "${existing.name}": ${status} (${duration})`,
  }
}
