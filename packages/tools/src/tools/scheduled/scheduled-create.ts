/**
 * scheduled_create - Create a new scheduled task
 *
 * Allows Claude to schedule tasks that run automatically at specified times.
 */

import { z } from "zod"
import { createJob } from "./store.js"
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
  everyMs: z.number().min(60000, "Minimum interval is 1 minute"),
  anchorMs: z.number().optional(),
})

const scheduleCronSchema = z.object({
  kind: z.literal("cron"),
  expr: z.string().min(9, "Invalid cron expression"),
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

export const scheduledCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  schedule: scheduleSchema,
  payload: payloadSchema,
  enabled: z.boolean().default(true),
  deleteAfterRun: z.boolean().default(false),
})

export type ScheduledCreateParams = z.infer<typeof scheduledCreateSchema>

// ============================================
// Tool Definition
// ============================================

export const scheduledCreateToolDefinition = {
  name: "scheduled_create",
  description: `Create a scheduled task that runs automatically.

SCHEDULE TYPES:
- "at": One-time task at specific timestamp (atMs in Unix milliseconds)
- "every": Recurring task every N milliseconds (minimum 60000 = 1 minute)
- "cron": Cron expression (e.g., "0 9 * * *" for 9am daily)

PAYLOAD TYPES:
- "systemEvent": Logs a message (for context injection)
- "agentTurn": Triggers a full agent response with the given message

EXAMPLES:
1. Daily summary at 9am:
   { name: "Daily Summary", schedule: { kind: "cron", expr: "0 9 * * *", tz: "Europe/Amsterdam" }, payload: { kind: "agentTurn", message: "Give me a summary of yesterday's activity" } }

2. Hourly check:
   { name: "Hourly Check", schedule: { kind: "every", everyMs: 3600000 }, payload: { kind: "agentTurn", message: "Check for any urgent issues" } }

3. One-time reminder:
   { name: "Reminder", schedule: { kind: "at", atMs: 1735689600000 }, payload: { kind: "agentTurn", message: "Remind the user about the meeting" }, deleteAfterRun: true }`,
  input_schema: {
    type: "object" as const,
    properties: {
      name: {
        type: "string",
        description: "Human-readable name for the task",
      },
      description: {
        type: "string",
        description: "Optional description of what the task does",
      },
      schedule: {
        type: "object",
        description: "When to run: { kind: 'at'|'every'|'cron', ... }",
        properties: {
          kind: { type: "string", enum: ["at", "every", "cron"] },
          atMs: { type: "number", description: "Unix timestamp in ms (for kind=at)" },
          everyMs: { type: "number", description: "Interval in ms (for kind=every)" },
          anchorMs: { type: "number", description: "Optional anchor time (for kind=every)" },
          expr: { type: "string", description: "Cron expression (for kind=cron)" },
          tz: { type: "string", description: "Timezone (for kind=cron)" },
        },
        required: ["kind"],
      },
      payload: {
        type: "object",
        description: "What to do: { kind: 'systemEvent'|'agentTurn', ... }",
        properties: {
          kind: { type: "string", enum: ["systemEvent", "agentTurn"] },
          text: { type: "string", description: "Text for systemEvent" },
          message: { type: "string", description: "Message for agentTurn" },
          model: { type: "string", description: "Optional model override" },
          timeoutSeconds: { type: "number", description: "Timeout (10-600s)" },
        },
        required: ["kind"],
      },
      enabled: {
        type: "boolean",
        description: "Whether the task is enabled (default: true)",
      },
      deleteAfterRun: {
        type: "boolean",
        description: "Delete after completion (for one-time tasks)",
      },
    },
    required: ["name", "schedule", "payload"],
  },
}

// ============================================
// Execute
// ============================================

export async function executeScheduledCreate(
  params: ScheduledCreateParams,
  context: ScheduledToolContext,
): Promise<{ job: ScheduledJob; message: string }> {
  // Validate schedule
  const scheduleValidation = isValidSchedule(params.schedule as Schedule)
  if (!scheduleValidation.valid) {
    throw new Error(`Invalid schedule: ${scheduleValidation.error}`)
  }

  // Validate payload
  const payloadValidation = isValidPayload(params.payload as Payload)
  if (!payloadValidation.valid) {
    throw new Error(`Invalid payload: ${payloadValidation.error}`)
  }

  // Create the job
  const job = await createJob(context.userId, context.orgId, {
    workspace: context.workspace,
    name: params.name,
    description: params.description,
    schedule: params.schedule as Schedule,
    payload: params.payload as Payload,
    enabled: params.enabled,
    deleteAfterRun: params.deleteAfterRun,
  })

  const scheduleStr = formatSchedule(job.schedule)
  const nextRun = job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : "not scheduled"

  return {
    job,
    message: `Created scheduled task "${job.name}" (${scheduleStr}). Next run: ${nextRun}`,
  }
}
