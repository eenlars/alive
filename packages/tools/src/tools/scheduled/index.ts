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

// Tool: scheduled_create
export {
  executeScheduledCreate,
  type ScheduledCreateParams,
  scheduledCreateSchema,
  scheduledCreateToolDefinition,
} from "./scheduled-create.js"
// Tool: scheduled_delete
export {
  executeScheduledDelete,
  type ScheduledDeleteParams,
  scheduledDeleteSchema,
  scheduledDeleteToolDefinition,
} from "./scheduled-delete.js"
// Tool: scheduled_list
export {
  executeScheduledList,
  type ScheduledListParams,
  type ScheduledListResult,
  scheduledListSchema,
  scheduledListToolDefinition,
} from "./scheduled-list.js"
// Tool: scheduled_trigger
export {
  executeScheduledTrigger,
  type ScheduledTriggerParams,
  scheduledTriggerSchema,
  scheduledTriggerToolDefinition,
} from "./scheduled-trigger.js"
// Tool: scheduled_update
export {
  executeScheduledUpdate,
  type ScheduledUpdateParams,
  scheduledUpdateSchema,
  scheduledUpdateToolDefinition,
} from "./scheduled-update.js"
// Scheduler
export {
  createDefaultExecutor,
  getSchedulerStatus,
  registerJobExecutor,
  startScheduler,
  stopScheduler,
  triggerJob,
} from "./scheduler.js"
// Store operations
export {
  createJob,
  deleteJob,
  getDueJobs,
  getJob,
  getStoreStatus,
  listJobs,
  markJobCompleted,
  markJobRunning,
  updateJob,
} from "./store.js"
// Types
export type {
  // Execution types
  JobExecutionContext,
  JobExecutionResult,
  JobState,
  JobStatus,
  // Payload types
  Payload,
  PayloadAgentTurn,
  PayloadSystemEvent,
  // Schedule types
  Schedule,
  ScheduleAt,
  ScheduleCron,
  // Job types
  ScheduledJob,
  // API types
  ScheduledJobCreate,
  ScheduledJobListParams,
  ScheduledJobListResult,
  ScheduledJobUpdate,
  // Tool context
  ScheduledToolContext,
  ScheduleEvery,
} from "./types.js"
// Validation & helpers
export {
  calculateNextRunTime,
  formatSchedule,
  isValidCronExpression,
  isValidPayload,
  isValidSchedule,
} from "./types.js"

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
import { scheduledDeleteToolDefinition } from "./scheduled-delete.js"
import { scheduledListToolDefinition } from "./scheduled-list.js"
import { scheduledTriggerToolDefinition } from "./scheduled-trigger.js"
import { scheduledUpdateToolDefinition } from "./scheduled-update.js"
