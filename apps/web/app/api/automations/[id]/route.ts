/**
 * Automation by ID API
 *
 * Get, update, or delete a specific automation job.
 */

import * as Sentry from "@sentry/nextjs"
import { isValidClaudeModel } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { isScheduleTrigger, type TriggerType } from "@/lib/api/schemas"
import { pokeCronService } from "@/lib/automation/cron-service"
import { ErrorCodes } from "@/lib/error-codes"
import { createServiceAppClient } from "@/lib/supabase/service"

interface RouteContext {
  params: Promise<{ id: string }>
}

/** Fields needed for ownership + validation in PATCH handler (user_id exists in DB but not yet in generated types) */
interface AutomationJobOwnership {
  user_id: string
  trigger_type: string | null
  cron_schedule: string | null
  cron_timezone: string | null
  action_type: string | null
  running_at: string | null
}

/**
 * GET /api/automations/[id] - Get a specific automation
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { id } = await context.params
    const supabase = createServiceAppClient()

    const { data, error } = await supabase
      .from("automation_jobs")
      .select(
        `
        id, user_id, org_id, site_id, name, description,
        trigger_type, cron_schedule, cron_timezone, run_at,
        action_type, action_prompt, action_source, action_target_page,
        action_model, action_timeout_seconds, skills, is_active, status,
        next_run_at, last_run_at, last_run_status, created_at, updated_at,
        domains:site_id (hostname)
      `,
      )
      .eq("id", id)
      .single()

    if (error || !data) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404 })
    }

    const row = data as unknown as { user_id: string; domains?: { hostname: string } }

    // Verify ownership
    if (row.user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 403 })
    }

    return NextResponse.json({
      automation: {
        ...data,
        hostname: row.domains?.hostname,
      },
    })
  } catch (error) {
    console.error("[Automations API] GET by ID error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

/**
 * PATCH /api/automations/[id] - Update an automation
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { id } = await context.params
    const body = await req.json()
    const supabase = createServiceAppClient()

    // Import validators
    const { validateCronSchedule, validateTimezone, validateTimeout, validateActionPrompt, formatNextRuns } =
      await import("@/lib/automation/validation")

    // Check ownership first
    const { data: existing } = await supabase
      .from("automation_jobs")
      .select("user_id, trigger_type, cron_schedule, cron_timezone, action_type, running_at")
      .eq("id", id)
      .single()

    if (!existing) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404 })
    }

    const existingRow = existing as unknown as AutomationJobOwnership

    if (existingRow.user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 403 })
    }

    // Build update object with only allowed fields
    const updates: Record<string, unknown> = {}
    const allowedFields = [
      "name",
      "description",
      "cron_schedule",
      "cron_timezone",
      "run_at",
      "action_prompt",
      "action_source",
      "action_target_page",
      "action_model",
      "action_timeout_seconds",
      "skills",
      "is_active",
    ]

    for (const field of allowedFields) {
      if (field in body) {
        // Validate skills array
        if (field === "skills") {
          updates[field] = Array.isArray(body[field]) ? body[field].filter((s: unknown) => typeof s === "string") : []
        } else {
          updates[field] = body[field]
        }
      }
    }

    // Event triggers (email, webhook) never have schedule fields — strip them
    if (!isScheduleTrigger(existingRow.trigger_type as TriggerType)) {
      delete updates.cron_schedule
      delete updates.cron_timezone
      delete updates.run_at
    }

    if (Object.keys(updates).length === 0) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { message: "No valid fields to update" },
      })
    }

    // Validate schedule changes
    if ("cron_schedule" in updates || "cron_timezone" in updates) {
      const cronExpr = (updates.cron_schedule as string) ?? existingRow.cron_schedule
      const cronTz = (updates.cron_timezone as string) ?? existingRow.cron_timezone

      if (cronExpr) {
        const cronCheck = validateCronSchedule(cronExpr, cronTz)
        if (!cronCheck.valid) {
          return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
            status: 400,
            details: { field: "cron_schedule", message: cronCheck.error },
          })
        }

        // Recompute next_run_at with the new schedule
        const { computeNextRunAtMs } = await import("@webalive/automation")
        const nextMs = computeNextRunAtMs({ kind: "cron", expr: cronExpr, tz: cronTz }, Date.now())
        if (nextMs) {
          updates.next_run_at = new Date(nextMs).toISOString()
        }
      }
    }

    // Validate timezone changes
    if ("cron_timezone" in updates) {
      const tzCheck = validateTimezone(updates.cron_timezone as string)
      if (!tzCheck.valid) {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { field: "cron_timezone", message: tzCheck.error },
        })
      }
    }

    // Validate timeout if changed
    if ("action_timeout_seconds" in updates) {
      const timeoutCheck = validateTimeout(updates.action_timeout_seconds as number)
      if (!timeoutCheck.valid) {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { field: "action_timeout_seconds", message: timeoutCheck.error },
        })
      }
    }

    // Validate model if changed
    if ("action_model" in updates && updates.action_model !== null) {
      if (!isValidClaudeModel(updates.action_model)) {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { field: "action_model", message: "Invalid model" },
        })
      }
    }

    // Validate prompt if changed
    if ("action_prompt" in updates) {
      const promptCheck = validateActionPrompt(existingRow.action_type ?? "prompt", updates.action_prompt as string)
      if (!promptCheck.valid) {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { field: "action_prompt", message: promptCheck.error },
        })
      }
    }

    // Sync status with is_active when toggled
    if ("is_active" in updates) {
      if (existingRow.running_at) {
        return structuredErrorResponse(ErrorCodes.AUTOMATION_ALREADY_RUNNING, {
          status: 409,
          details: { startedAt: existingRow.running_at },
        })
      }
      updates.status = updates.is_active ? "idle" : "disabled"
    }

    const { data, error } = await supabase.from("automation_jobs").update(updates).eq("id", id).select().single()

    if (error) {
      console.error("[Automations API] Update error:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    // Get next runs preview if schedule was updated
    let nextRunsDisplay: string | undefined
    if (data.trigger_type === "cron" && data.cron_schedule) {
      const cronCheck = validateCronSchedule(data.cron_schedule, data.cron_timezone)
      nextRunsDisplay = formatNextRuns(cronCheck.nextRuns)
    }

    // Poke CronService so it picks up schedule changes immediately
    pokeCronService()

    return NextResponse.json({ automation: data, nextRunsPreview: nextRunsDisplay })
  } catch (error) {
    console.error("[Automations API] PATCH error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

/**
 * DELETE /api/automations/[id] - Delete an automation
 */
export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { id } = await context.params
    const supabase = createServiceAppClient()

    // Check ownership first
    const { data: existing } = await supabase.from("automation_jobs").select("user_id").eq("id", id).single()

    if (!existing) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404 })
    }

    const existingRow = existing as unknown as { user_id: string }

    if (existingRow.user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 403 })
    }

    const { error } = await supabase.from("automation_jobs").delete().eq("id", id)

    if (error) {
      console.error("[Automations API] Delete error:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[Automations API] DELETE error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
