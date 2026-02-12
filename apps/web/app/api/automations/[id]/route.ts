/**
 * Automation by ID API
 *
 * Get, update, or delete a specific automation job.
 */

import * as Sentry from "@sentry/nextjs"
import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { getSupabaseCredentials } from "@/lib/env/server"
import { ErrorCodes } from "@/lib/error-codes"

interface RouteContext {
  params: Promise<{ id: string }>
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
    const { url, key } = getSupabaseCredentials("service")
    const supabase = createClient(url, key, { db: { schema: "app" } })

    const { data, error } = await supabase
      .from("automation_jobs")
      .select(
        `
        *,
        domains:site_id (hostname)
      `,
      )
      .eq("id", id)
      .single()

    if (error || !data) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404 })
    }

    // Verify ownership
    if ((data as any).user_id !== user.id) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 403 })
    }

    return NextResponse.json({
      automation: {
        ...data,
        hostname: (data as any).domains?.hostname,
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
    const { url, key } = getSupabaseCredentials("service")
    const supabase = createClient(url, key, { db: { schema: "app" } })

    // Import validators
    const { validateCronSchedule, validateTimezone, validateTimeout, validateActionPrompt, formatNextRuns } =
      await import("@/lib/automation/validation")

    // Check ownership first
    const { data: existing } = await supabase.from("automation_jobs").select("*").eq("id", id).single()

    if (!existing) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404 })
    }

    if ((existing as any).user_id !== user.id) {
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

    if (Object.keys(updates).length === 0) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { message: "No valid fields to update" },
      })
    }

    // Validate schedule changes
    if ("cron_schedule" in updates || "cron_timezone" in updates) {
      const cronExpr = (updates.cron_schedule as string) || (existing as any).cron_schedule
      const cronTz = (updates.cron_timezone as string) || (existing as any).cron_timezone

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
    if ("action_timeout_seconds" in body) {
      const timeoutCheck = validateTimeout(body.action_timeout_seconds)
      if (!timeoutCheck.valid) {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { field: "action_timeout_seconds", message: timeoutCheck.error },
        })
      }
      updates.action_timeout_seconds = body.action_timeout_seconds
    }

    // Validate prompt if changed
    if ("action_prompt" in updates) {
      const promptCheck = validateActionPrompt((existing as any).action_type, updates.action_prompt as string)
      if (!promptCheck.valid) {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { field: "action_prompt", message: promptCheck.error },
        })
      }
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
    const { url, key } = getSupabaseCredentials("service")
    const supabase = createClient(url, key, { db: { schema: "app" } })

    // Check ownership first
    const { data: existing } = await supabase.from("automation_jobs").select("user_id").eq("id", id).single()

    if (!existing) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404 })
    }

    if ((existing as any).user_id !== user.id) {
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
