/**
 * Cron expression parts and types for the cron scheduler component
 */

export interface CronParts {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

export interface CronPreset {
  label: string
  value: string
  description: string
}

export type CronMode = "preset" | "custom"

export interface CronEditorState {
  mode: CronMode
  preset: string
  customExpression: string
  parsedDescription: string
}
