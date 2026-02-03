/**
 * @webalive/automation - Type definitions for automation scheduling
 *
 * Minimal types needed for cron/interval/one-time schedule computation.
 */

/**
 * One-time execution at a specific timestamp
 */
export type ScheduleAt = {
  kind: "at"
  /** Unix timestamp in milliseconds when the job should run */
  atMs: number
}

/**
 * Recurring execution at fixed intervals
 */
export type ScheduleEvery = {
  kind: "every"
  /** Interval in milliseconds between runs */
  everyMs: number
  /** Optional anchor timestamp to align intervals */
  anchorMs?: number
}

/**
 * Cron expression-based scheduling
 */
export type ScheduleCron = {
  kind: "cron"
  /** Cron expression (e.g., "0 6 * * *" for 6am daily) */
  expr: string
  /** Timezone for cron evaluation (e.g., "Europe/Amsterdam") */
  tz?: string
}

/**
 * Union of all schedule types
 */
export type AutomationSchedule = ScheduleAt | ScheduleEvery | ScheduleCron
