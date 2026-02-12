/**
 * Automation System
 *
 * Scheduling and execution live in apps/worker (standalone Bun process).
 * The web app provides:
 * - API routes for CRUD operations on automation jobs
 * - Thin client to poke/query the worker process
 * - Engine module for claim/execute/finish lifecycle (used by trigger routes)
 * - Run log reading for the UI
 */

// Worker client — pokeCronService delegates to worker HTTP API
export { type CronEvent, type CronServiceConfig, getCronServiceStatus, pokeCronService } from "./cron-service"

// Executor - runs individual jobs (used by trigger routes in web process)
export { type AutomationJobParams, type AutomationJobResult, runAutomationJob } from "./executor"

// Run logs - per-job JSONL logs
export {
  appendRunLog,
  deleteRunLog,
  getLogPath,
  getRunStats,
  listLoggedJobs,
  type RunLogConfig,
  type RunLogEntry,
  readRunLog,
} from "./run-log"
