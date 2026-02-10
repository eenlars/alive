/**
 * scheduled_update - Update a scheduled task
 *
 * Modify an existing scheduled task's properties.
 */

import { z } from "zod"
import { getJob, updateJob } from "./store.js"
import type { Payload, Schedule, ScheduledJob, ScheduledToolContext } from "./types.js"
import { formatSchedule, isValidPayload, isValidSchedule } from "./types.js"

// ============================================
// Schema
// ============================================

const scheduleAtSchema = z.object({
  kind: z.literal("at"),
  atMs: z.number().positive(),
})

const scheduleEverySchema = z.object({
  kind: z.literal("every"),
  everyMs: z.number().min(60000),
  anchorMs: z.number().optional(),
})

const scheduleCronSchema = z.object({
  kind: z.literal("cron"),
  expr: z.string().min(9),
  tz: z.string().optional(),
})

const scheduleSchema = z.discriminatedUnion("kind", [scheduleAtSchema, scheduleEverySchema, scheduleCronSchema])

const payloadSystemEventSchema = z.object({
  kind: z.literal("systemEvent"),
  text: z.string().min(1),
})

const payloadAgentTurnSchema = z.object({
  kind: z.literal("agentTurn"),
  message: z.string().min(1),
  model: z.string().optional(),
  timeoutSeconds: z.number().min(10).max(600).optional(),
  deliver: z.boolean().optional(),
  channel: z.string().optional(),
  to: z.string().optional(),
})

const payloadSchema = z.discriminatedUnion("kind", [payloadSystemEventSchema, payloadAgentTurnSchema])

export const scheduledUpdateSchema = z.object({
  jobId: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  schedule: scheduleSchema.optional(),
  payload: payloadSchema.optional(),
  enabled: z.boolean().optional(),
  deleteAfterRun: z.boolean().optional(),
})

export type ScheduledUpdateParams = z.infer<typeof scheduledUpdateSchema>

// ============================================
// Tool Definition
// ============================================

export const scheduledUpdateToolDefinition = {
  name: "scheduled_update",
  description: `Update an existing scheduled task.

Provide the jobId and any fields you want to change:
- name: New task name
- description: New description
- schedule: New schedule (replaces entirely)
- payload: New payload (replaces entirely)
- enabled: Enable/disable the task
- deleteAfterRun: Change one-shot behavior

Use scheduled_list to find job IDs.`,
  input_schema: {
    type: "object" as const,
    properties: {
      jobId: {
        type: "string",
        description: "The job ID to update (UUID)",
      },
      name: {
        type: "string",
        description: "New task name",
      },
      description: {
        type: "string",
        description: "New description",
      },
      schedule: {
        type: "object",
        description: "New schedule configuration",
      },
      payload: {
        type: "object",
        description: "New payload configuration",
      },
      enabled: {
        type: "boolean",
        description: "Enable or disable the task",
      },
      deleteAfterRun: {
        type: "boolean",
        description: "Delete after completion",
      },
    },
    required: ["jobId"],
  },
}

// ============================================
// Execute
// ============================================

export async function executeScheduledUpdate(
  params: ScheduledUpdateParams,
  context: ScheduledToolContext,
): Promise<{ job: ScheduledJob; message: string }> {
  // Get existing job
  const existing = await getJob(params.jobId)
  if (!existing) {
    throw new Error(`Job not found: ${params.jobId}`)
  }

  // Verify ownership
  if (existing.userId !== context.userId) {
    throw new Error("You can only update your own scheduled tasks")
  }

  // Validate new schedule if provided
  if (params.schedule) {
    const scheduleValidation = isValidSchedule(params.schedule as Schedule)
    if (!scheduleValidation.valid) {
      throw new Error(`Invalid schedule: ${scheduleValidation.error}`)
    }
  }

  // Validate new payload if provided
  if (params.payload) {
    const payloadValidation = isValidPayload(params.payload as Payload)
    if (!payloadValidation.valid) {
      throw new Error(`Invalid payload: ${payloadValidation.error}`)
    }
  }

  // Build update object
  const updates: Record<string, unknown> = {}
  if (params.name !== undefined) updates.name = params.name
  if (params.description !== undefined) updates.description = params.description
  if (params.schedule !== undefined) updates.schedule = params.schedule
  if (params.payload !== undefined) updates.payload = params.payload
  if (params.enabled !== undefined) updates.enabled = params.enabled
  if (params.deleteAfterRun !== undefined) updates.deleteAfterRun = params.deleteAfterRun

  // Update the job
  const job = await updateJob(params.jobId, updates)
  if (!job) {
    throw new Error("Failed to update job")
  }

  const changes: string[] = []
  if (params.name) changes.push(`name: "${params.name}"`)
  if (params.schedule) changes.push(`schedule: ${formatSchedule(params.schedule as Schedule)}`)
  if (params.enabled !== undefined) changes.push(`enabled: ${params.enabled}`)
  if (params.payload) changes.push("payload updated")

  return {
    job,
    message: `Updated task "${job.name}": ${changes.join(", ")}`,
  }
}
