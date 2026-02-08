/**
 * Predefined cron expressions and their human-readable descriptions
 */

import type { CronPreset } from "./types"

export const CRON_PRESETS: CronPreset[] = [
  {
    label: "Every 5 minutes",
    value: "*/5 * * * *",
    description: "Checks constantly — 288 runs per day",
  },
  {
    label: "Hourly",
    value: "0 * * * *",
    description: "Once per hour, on the hour",
  },
  {
    label: "Daily at 9 AM",
    value: "0 9 * * *",
    description: "Every morning at 9:00",
  },
  {
    label: "Weekdays at 9 AM",
    value: "0 9 * * 1-5",
    description: "Monday through Friday, skips weekends",
  },
  {
    label: "Weekly on Sunday",
    value: "0 9 * * 0",
    description: "Once a week, Sunday morning at 9:00",
  },
  {
    label: "Monthly on the 1st",
    value: "0 9 1 * *",
    description: "First day of every month at 9:00",
  },
]

/**
 * Try to match a cron expression to a preset
 */
export function matchPreset(expression: string): CronPreset | null {
  return CRON_PRESETS.find(p => p.value === expression) || null
}
