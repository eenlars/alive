/**
 * scheduled_delete - Delete a scheduled task
 *
 * Permanently removes a scheduled task.
 */

import { z } from "zod"
import { deleteJob, getJob } from "./store.js"
import type { ScheduledToolContext } from "./types.js"

// ============================================
// Schema
// ============================================

export const scheduledDeleteSchema = z.object({
  jobId: z.string().uuid(),
})

export type ScheduledDeleteParams = z.infer<typeof scheduledDeleteSchema>

// ============================================
// Tool Definition
// ============================================

export const scheduledDeleteToolDefinition = {
  name: "scheduled_delete",
  description: `Delete a scheduled task permanently.

Provide the jobId to delete. Use scheduled_list to find job IDs.
This action cannot be undone.`,
  input_schema: {
    type: "object" as const,
    properties: {
      jobId: {
        type: "string",
        description: "The job ID to delete (UUID)",
      },
    },
    required: ["jobId"],
  },
}

// ============================================
// Execute
// ============================================

export async function executeScheduledDelete(
  params: ScheduledDeleteParams,
  context: ScheduledToolContext,
): Promise<{ success: boolean; message: string }> {
  // Get existing job
  const existing = await getJob(params.jobId)
  if (!existing) {
    throw new Error(`Job not found: ${params.jobId}`)
  }

  // Verify ownership
  if (existing.userId !== context.userId) {
    throw new Error("You can only delete your own scheduled tasks")
  }

  const jobName = existing.name

  // Delete the job
  const success = await deleteJob(params.jobId)
  if (!success) {
    throw new Error("Failed to delete job")
  }

  return {
    success: true,
    message: `Deleted scheduled task "${jobName}"`,
  }
}
