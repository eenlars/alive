/**
 * scheduled_list - List scheduled tasks
 *
 * Lists all scheduled tasks for the current workspace or user.
 */

import { z } from "zod"
import { listJobs } from "./store.js"
import type { ScheduledJobListResult, ScheduledToolContext } from "./types.js"
import { formatSchedule } from "./types.js"

// ============================================
// Schema
// ============================================

export const scheduledListSchema = z.object({
  workspace: z.string().optional(),
  enabled: z.boolean().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
})

export type ScheduledListParams = z.infer<typeof scheduledListSchema>

// ============================================
// Tool Definition
// ============================================

export const scheduledListToolDefinition = {
  name: "scheduled_list",
  description: `List scheduled tasks.

Filters:
- workspace: Filter by workspace domain (optional, defaults to all)
- enabled: Filter by enabled status (optional)
- limit: Max results (1-100, default 20)
- offset: Pagination offset

Returns list of tasks with their schedules, status, and next run times.`,
  input_schema: {
    type: "object" as const,
    properties: {
      workspace: {
        type: "string",
        description: "Filter by workspace domain",
      },
      enabled: {
        type: "boolean",
        description: "Filter by enabled status",
      },
      limit: {
        type: "number",
        description: "Max results (1-100, default 20)",
      },
      offset: {
        type: "number",
        description: "Pagination offset",
      },
    },
    required: [],
  },
}

// ============================================
// Execute
// ============================================

export interface ScheduledListResult extends ScheduledJobListResult {
  summary: string
}

export async function executeScheduledList(
  params: ScheduledListParams,
  context: ScheduledToolContext,
): Promise<ScheduledListResult> {
  const result = await listJobs(context.userId, {
    workspace: params.workspace ?? context.workspace,
    enabled: params.enabled,
    limit: params.limit,
    offset: params.offset,
  })

  // Format summary
  const lines: string[] = []

  if (result.jobs.length === 0) {
    lines.push("No scheduled tasks found.")
  } else {
    lines.push(`Found ${result.total} scheduled task(s):`)
    lines.push("")

    for (const job of result.jobs) {
      const status = job.enabled ? "enabled" : "disabled"
      const schedule = formatSchedule(job.schedule)
      const nextRun = job.state.nextRunAtMs ? new Date(job.state.nextRunAtMs).toISOString() : "none"
      const lastRun = job.state.lastRunAtMs
        ? `${new Date(job.state.lastRunAtMs).toISOString()} (${job.state.lastStatus})`
        : "never"

      lines.push(`- **${job.name}** (${job.id.slice(0, 8)})`)
      lines.push(`  Status: ${status} | Schedule: ${schedule}`)
      lines.push(`  Next: ${nextRun} | Last: ${lastRun}`)
      if (job.description) {
        lines.push(`  ${job.description}`)
      }
      lines.push("")
    }

    if (result.hasMore) {
      lines.push(`... and ${result.total - result.jobs.length} more`)
    }
  }

  return {
    ...result,
    summary: lines.join("\n"),
  }
}
