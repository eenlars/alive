/**
 * Predefined cron expressions and their human-readable descriptions
 */

import type { CronPreset } from "./types"

export const CRON_PRESETS: CronPreset[] = [
  {
    label: "Every 5 minutes",
    value: "*/5 * * * *",
    description: "Runs every 5 minutes",
  },
  {
    label: "Every 10 minutes",
    value: "*/10 * * * *",
    description: "Runs every 10 minutes",
  },
  {
    label: "Hourly",
    value: "0 * * * *",
    description: "Runs at the top of every hour",
  },
  {
    label: "Daily",
    value: "0 9 * * *",
    description: "Runs at 9:00 AM every day",
  },
  {
    label: "Monday to Friday",
    value: "0 9 * * 1-5",
    description: "Weekdays at 9:00 AM",
  },
  {
    label: "Monday",
    value: "0 9 * * 1",
    description: "Mondays at 9:00 AM",
  },
  {
    label: "Weekly",
    value: "0 9 * * 0",
    description: "Every Sunday at 9:00 AM",
  },
  {
    label: "Monthly",
    value: "0 9 1 * *",
    description: "First day of month at 9:00 AM",
  },
  {
    label: "Every 6 hours",
    value: "0 */6 * * *",
    description: "At 12:00 AM, 6:00 AM, 12:00 PM, 6:00 PM",
  },
  {
    label: "Twice daily",
    value: "0 9,18 * * *",
    description: "At 9:00 AM and 6:00 PM",
  },
]

/**
 * Try to match a cron expression to a preset
 */
export function matchPreset(expression: string): CronPreset | null {
  return CRON_PRESETS.find(p => p.value === expression) || null
}
