/**
 * Automation Validation Module
 *
 * Provides field-specific validators that return user-friendly error messages.
 * All validators are defensive and won't throw.
 */

import { getWorkspacePath } from "@webalive/shared"
import { Cron } from "croner"
import { createServiceAppClient } from "@/lib/supabase/service"

/**
 * Validate a cron schedule and get the next 3 run times
 */
export function validateCronSchedule(
  expr: string | undefined | null,
  tz?: string | undefined | null,
): {
  valid: boolean
  error?: string
  nextRuns?: Date[]
} {
  if (!expr?.trim()) {
    return { valid: false, error: "Cron schedule cannot be empty" }
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
    // Extract just the relevant part of croner error message
    const friendlyMessage = message.includes("Invalid")
      ? `Invalid cron expression: "${expr}". ${message}`
      : `Invalid cron expression: "${expr}". Check syntax at crontab.guru`

    return {
      valid: false,
      error: friendlyMessage,
    }
  }
}

/**
 * Validate timezone string
 */
export function validateTimezone(tz: string | undefined | null): {
  valid: boolean
  error?: string
} {
  if (!tz?.trim()) {
    return { valid: true } // Timezone is optional, defaults to UTC
  }

  try {
    // Try to create a formatter with this timezone
    // This is the most portable way to validate timezone names
    new Intl.DateTimeFormat("en-US", { timeZone: tz.trim() })
    return { valid: true }
  } catch {
    return {
      valid: false,
      error: `Invalid timezone: "${tz}". Use IANA timezone names like "Europe/Amsterdam" or "America/New_York"`,
    }
  }
}

/**
 * Validate action prompt for prompt-type automations
 */
export function validateActionPrompt(
  actionType: string | undefined,
  prompt: string | undefined | null,
): {
  valid: boolean
  error?: string
} {
  if (actionType !== "prompt") {
    return { valid: true } // Not a prompt action, no prompt needed
  }

  if (!prompt?.trim()) {
    return { valid: false, error: "Prompt cannot be empty for prompt-type automations" }
  }

  if (prompt.length > 10000) {
    return { valid: false, error: "Prompt is too long (max 10,000 characters)" }
  }

  return { valid: true }
}

/**
 * Validate action timeout in seconds
 */
export function validateTimeout(seconds: unknown): {
  valid: boolean
  error?: string
} {
  if (seconds === undefined || seconds === null) {
    return { valid: true } // Optional, will use default
  }

  const num = typeof seconds === "number" ? seconds : Number(seconds)

  if (!Number.isInteger(num) || num < 1) {
    return { valid: false, error: "Timeout must be a positive integer (minimum 1 second)" }
  }

  if (num > 3600) {
    return { valid: false, error: "Timeout cannot exceed 1 hour (3600 seconds)" }
  }

  return { valid: true }
}

/**
 * Validate that required fields are present
 */
export function validateRequiredFields(
  body: Record<string, unknown>,
  required: string[],
): {
  valid: boolean
  missing?: string[]
} {
  const missing = required.filter(field => !body[field])

  if (missing.length === 0) {
    return { valid: true }
  }

  return {
    valid: false,
    missing,
  }
}

/**
 * Validate trigger-specific required fields
 */
export function validateTriggerType(
  triggerType: string | undefined,
  body: Record<string, unknown>,
): {
  valid: boolean
  error?: string
} {
  if (!triggerType) {
    return { valid: false, error: "trigger_type is required" }
  }

  if (!["cron", "webhook", "one-time", "email"].includes(triggerType)) {
    return {
      valid: false,
      error: `Invalid trigger_type: "${triggerType}". Must be one of: cron, webhook, one-time, email`,
    }
  }

  if (triggerType === "cron" && !body.cron_schedule) {
    return { valid: false, error: "cron_schedule is required for cron-type automations" }
  }

  if (triggerType === "one-time" && !body.run_at) {
    return { valid: false, error: "run_at is required for one-time automations" }
  }

  if (triggerType === "email" && !body.email_address) {
    return { valid: false, error: "email_address is required for email-type automations" }
  }

  return { valid: true }
}

/**
 * Validate action type
 */
export function validateActionType(actionType: string | undefined): {
  valid: boolean
  error?: string
} {
  if (!actionType) {
    return { valid: false, error: "action_type is required" }
  }

  if (!["prompt", "webhook", "integration"].includes(actionType)) {
    return { valid: false, error: `Invalid action_type: "${actionType}". Must be one of: prompt, webhook, integration` }
  }

  return { valid: true }
}

/**
 * Validate skills array (check they exist)
 */
export async function validateSkills(skillIds: unknown[]): Promise<{
  valid: boolean
  errors?: string[]
}> {
  if (!Array.isArray(skillIds) || skillIds.length === 0) {
    return { valid: true } // Optional
  }

  const invalidSkills = skillIds.filter(s => typeof s !== "string")
  if (invalidSkills.length > 0) {
    return { valid: false, errors: ["All skill IDs must be strings"] }
  }

  // Note: We don't validate that skills exist here since that requires importing
  // tools package which is heavy. Skills will be validated when the job runs.
  // If a skill doesn't exist, it just won't be loaded (graceful degradation).

  return { valid: true }
}

/**
 * Validate workspace exists and is properly deployed
 */
export async function validateWorkspace(hostname: string | undefined): Promise<{
  valid: boolean
  error?: string
}> {
  if (!hostname?.trim()) {
    return { valid: false, error: "Workspace hostname is required" }
  }

  // Use getWorkspacePath (resolves to /user, same as chat flow).
  // workspace-secure.ts resolves to /user/src which breaks sites without src/.
  const { existsSync } = await import("node:fs")
  const cwd = getWorkspacePath(hostname)

  if (!existsSync(cwd)) {
    return {
      valid: false,
      error:
        `Site "${hostname}" is not properly deployed. The workspace directory is missing (${cwd}). ` +
        "The site may need to be redeployed. Please contact support if this persists.",
    }
  }

  return { valid: true }
}

/**
 * Validate site_id points to a valid site in the database
 */
export async function validateSiteId(siteId: string | undefined): Promise<{
  valid: boolean
  error?: string
  hostname?: string
}> {
  if (!siteId?.trim()) {
    return { valid: false, error: "site_id is required" }
  }

  try {
    const supabase = createServiceAppClient()

    const { data: site, error } = await supabase.from("domains").select("hostname").eq("domain_id", siteId).single()

    if (error || !site?.hostname) {
      return { valid: false, error: "Site not found. Check that it exists and you have access." }
    }

    // Also validate the workspace exists on the filesystem
    const wsValidation = await validateWorkspace(site.hostname)
    if (!wsValidation.valid) {
      return { valid: false, error: wsValidation.error }
    }

    return { valid: true, hostname: site.hostname }
  } catch (error) {
    return { valid: false, error: `Failed to validate site: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Format next run times for display
 */
export function formatNextRuns(nextRuns: Date[] | undefined): string | undefined {
  if (!nextRuns || nextRuns.length === 0) return undefined

  return nextRuns
    .map((date, i) => {
      if (i === 0) {
        return `Next run: ${date.toLocaleString()}`
      }
      return date.toLocaleString()
    })
    .join(" • ")
}

/**
 * Build structured error response for multiple validation errors
 */
export function buildValidationErrors(errors: Record<string, string>): Record<string, unknown> {
  return {
    ok: false,
    error: "Validation failed",
    details: errors,
  }
}
