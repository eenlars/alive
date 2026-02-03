/**
 * Automation System
 *
 * Scheduled automation for sites with features inspired by ClawdBot:
 * - In-process scheduler using setTimeout (precise timing)
 * - Retry logic with exponential backoff
 * - Concurrent job limits
 * - Per-job JSONL run logs with auto-pruning
 * - Real-time SSE events
 * - Model and thinking prompt overrides
 *
 * @example
 * ```typescript
 * // Start the service (automatically done via instrumentation.ts)
 * import { startCronService, getCronServiceStatus } from "@/lib/automation"
 *
 * await startCronService()
 * const status = getCronServiceStatus()
 * console.log(status.runningJobs)
 *
 * // Read run logs
 * import { readRunLog, getRunStats } from "@/lib/automation/run-log"
 *
 * const entries = await readRunLog(jobId, { limit: 10 })
 * const stats = await getRunStats(jobId)
 * ```
 */

// CronService - in-process scheduler
export {
  startCronService,
  stopCronService,
  getCronServiceStatus,
  triggerJob,
  type CronEvent,
  type CronServiceConfig,
} from "./cron-service"

// Executor - runs individual jobs
export { runAutomationJob, type AutomationJobParams, type AutomationJobResult } from "./executor"

// Run logs - per-job JSONL logs
export {
  appendRunLog,
  readRunLog,
  getRunStats,
  deleteRunLog,
  listLoggedJobs,
  getLogPath,
  type RunLogEntry,
  type RunLogConfig,
} from "./run-log"
