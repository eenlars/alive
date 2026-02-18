import type { ClaudeModel } from "@webalive/shared"
import type { TriggerType } from "@/lib/api/schemas"

export type AutomationFormData = {
  site_id: string
  name: string
  description: string
  trigger_type: TriggerType
  /** Only set when trigger_type is "cron" */
  cron_schedule: string
  /** Only set when trigger_type is "cron" or "one-time" */
  cron_timezone: string
  /** Only set when trigger_type is "one-time" */
  run_at: string
  action_type: "prompt" | "sync" | "publish"
  action_prompt: string
  action_source: string
  action_target_page: string
  action_timeout_seconds: number | null
  action_model: ClaudeModel | null
  skills: string[]
  is_active: boolean
}

export type SkillItem = {
  id: string
  displayName: string
  description: string
}

export type EditTab = "general" | "prompt" | "trigger" | "tools"

export const EDIT_TABS: { id: EditTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "prompt", label: "Prompt" },
  { id: "trigger", label: "Trigger" },
  { id: "tools", label: "Tools" },
]
