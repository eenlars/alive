/**
 * @webalive/automation - Cron scheduler for automation jobs
 *
 * Uses croner for cron expression parsing (same as OpenClaw).
 * Provides function for computing next run times.
 */

import { Cron } from "croner"
import type { AutomationSchedule } from "./types.js"

/**
 * Compute the next run time for a given schedule
 *
 * @param schedule - The schedule configuration
 * @param nowMs - Current timestamp in milliseconds
 * @returns Next run timestamp in milliseconds, or undefined if no future run
 */
export function computeNextRunAtMs(schedule: AutomationSchedule, nowMs: number): number | undefined {
  if (schedule.kind === "at") {
    // One-time: only run if still in the future
    return schedule.atMs > nowMs ? schedule.atMs : undefined
  }

  if (schedule.kind === "every") {
    // Interval: compute next occurrence from anchor
    const everyMs = Math.max(1, Math.floor(schedule.everyMs))
    const anchor = Math.max(0, Math.floor(schedule.anchorMs ?? nowMs))

    if (nowMs < anchor) {
      return anchor
    }

    const elapsed = nowMs - anchor
    const steps = Math.max(1, Math.floor((elapsed + everyMs - 1) / everyMs))
    return anchor + steps * everyMs
  }

  // Cron expression
  const expr = schedule.expr.trim()
  if (!expr) {
    return undefined
  }

  try {
    const cron = new Cron(expr, {
      timezone: schedule.tz?.trim() || undefined,
      catch: false,
    })
    const next = cron.nextRun(new Date(nowMs))
    return next ? next.getTime() : undefined
  } catch {
    // Invalid cron expression
    return undefined
  }
}

/**
 * Validate a cron expression and return error details
 *
 * @param expr - Cron expression string
 * @param tz - Optional timezone (IANA format)
 * @returns Validation result with error message if invalid
 */
export function validateCronExpression(
  expr: string | null | undefined,
  tz?: string | null,
): {
  valid: boolean
  error?: string
  nextRuns?: Date[]
} {
  if (!expr?.trim()) {
    return { valid: false, error: "Cron expression cannot be empty" }
  }

  try {
    const cron = new Cron(expr.trim(), {
      timezone: tz?.trim() || undefined,
      catch: false,
    })

    // Get next 3 run times for preview
    const now = new Date()
    const nextRuns: Date[] = []
    let current = now

    for (let i = 0; i < 3; i++) {
      const next = cron.nextRun(current)
      if (!next) break
      nextRuns.push(next)
      current = next
    }

    return {
      valid: true,
      nextRuns,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const friendlyMessage = message.includes("Invalid")
      ? `Invalid cron expression: "${expr}". ${message}`
      : `Invalid cron expression: "${expr}". Check syntax at crontab.guru`

    return {
      valid: false,
      error: friendlyMessage,
    }
  }
}
