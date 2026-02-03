/**
 * Scheduled Tasks (Cron) Module
 *
 * Enables Claude to create and manage scheduled tasks that run automatically.
 *
 * @example
 * ```typescript
 * // Create a daily task
 * await executeScheduledCreate({
 *   name: "Daily Summary",
 *   schedule: { kind: "cron", expr: "0 9 * * *", tz: "Europe/Amsterdam" },
 *   payload: { kind: "agentTurn", message: "Give me a summary" }
 * }, context)
 *
 * // List tasks
 * const { jobs } = await executeScheduledList({}, context)
 *
 * // Update a task
 * await executeScheduledUpdate({ jobId: "...", enabled: false }, context)
 *
 * // Delete a task
 * await executeScheduledDelete({ jobId: "..." }, context)
 *
 * // Manually trigger a task
 * await executeScheduledTrigger({ jobId: "..." }, context)
 * ```
 */

// Types
export type {
  // Schedule types
  Schedule,
  ScheduleAt,
  ScheduleEvery,
  ScheduleCron,
  // Payload types
  Payload,
  PayloadSystemEvent,
  PayloadAgentTurn,
  // Job types
  ScheduledJob,
  JobState,
  JobStatus,
  // API types
  ScheduledJobCreate,
  ScheduledJobUpdate,
  ScheduledJobListParams,
  ScheduledJobListResult,
  // Execution types
  JobExecutionContext,
  JobExecutionResult,
  // Tool context
  ScheduledToolContext,
} from "./types.js"

// Validation & helpers
export {
  isValidSchedule,
  isValidPayload,
  isValidCronExpression,
  calculateNextRunTime,
  formatSchedule,
} from "./types.js"

// Store operations
export {
  createJob,
  getJob,
  updateJob,
  deleteJob,
  listJobs,
  getDueJobs,
  markJobRunning,
  markJobCompleted,
  getStoreStatus,
} from "./store.js"

// Scheduler
export {
  startScheduler,
  stopScheduler,
  getSchedulerStatus,
  registerJobExecutor,
  triggerJob,
  createDefaultExecutor,
} from "./scheduler.js"

// Tool: scheduled_create
export {
  scheduledCreateSchema,
  scheduledCreateToolDefinition,
  executeScheduledCreate,
  type ScheduledCreateParams,
} from "./scheduled-create.js"

// Tool: scheduled_list
export {
  scheduledListSchema,
  scheduledListToolDefinition,
  executeScheduledList,
  type ScheduledListParams,
  type ScheduledListResult,
} from "./scheduled-list.js"

// Tool: scheduled_update
export {
  scheduledUpdateSchema,
  scheduledUpdateToolDefinition,
  executeScheduledUpdate,
  type ScheduledUpdateParams,
} from "./scheduled-update.js"

// Tool: scheduled_delete
export {
  scheduledDeleteSchema,
  scheduledDeleteToolDefinition,
  executeScheduledDelete,
  type ScheduledDeleteParams,
} from "./scheduled-delete.js"

// Tool: scheduled_trigger
export {
  scheduledTriggerSchema,
  scheduledTriggerToolDefinition,
  executeScheduledTrigger,
  type ScheduledTriggerParams,
} from "./scheduled-trigger.js"

// All tool definitions for registration
export const SCHEDULED_TOOL_DEFINITIONS = [
  scheduledCreateToolDefinition,
  scheduledListToolDefinition,
  scheduledUpdateToolDefinition,
  scheduledDeleteToolDefinition,
  scheduledTriggerToolDefinition,
] as const

// Import for re-export
import { scheduledCreateToolDefinition } from "./scheduled-create.js"
import { scheduledListToolDefinition } from "./scheduled-list.js"
import { scheduledUpdateToolDefinition } from "./scheduled-update.js"
import { scheduledDeleteToolDefinition } from "./scheduled-delete.js"
import { scheduledTriggerToolDefinition } from "./scheduled-trigger.js"
