/**
 * Automations API
 *
 * List and manage automation jobs for an organization.
 */

import * as Sentry from "@sentry/nextjs"
import { computeNextRunAtMs } from "@webalive/automation"
import type { NextRequest } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import type { Res } from "@/lib/api/schemas"
import { alrighty } from "@/lib/api/server"
import { pokeCronService } from "@/lib/automation/cron-service"
import { ErrorCodes } from "@/lib/error-codes"
import { createServiceAppClient } from "@/lib/supabase/service"

type AutomationJob = Res<"automations">["automations"][number]

/**
 * GET /api/automations - List automations for user's organizations
 *
 * Query params:
 * - org_id: Filter by organization (optional)
 * - site_id: Filter by site (optional)
 * - limit: Max results (default 50)
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get("org_id")
    const siteId = searchParams.get("site_id")
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100)

    const supabase = createServiceAppClient()

    // Build query - join with domains to get hostname
    let query = supabase
      .from("automation_jobs")
      .select(
        `
        id,
        site_id,
        name,
        description,
        trigger_type,
        cron_schedule,
        cron_timezone,
        run_at,
        action_type,
        action_prompt,
        action_source,
        action_target_page,
        skills,
        is_active,
        status,
        last_run_at,
        last_run_status,
        next_run_at,
        created_at,
        domains:site_id (hostname)
      `,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (orgId) {
      query = query.eq("org_id", orgId)
    }

    if (siteId) {
      query = query.eq("site_id", siteId)
    }

    const { data, error } = await query

    if (error) {
      console.error("[Automations API] Query error:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    // Flatten the joined data
    const automations: AutomationJob[] = (data || []).map((row: any) => ({
      id: row.id,
      site_id: row.site_id,
      name: row.name,
      description: row.description,
      trigger_type: row.trigger_type,
      cron_schedule: row.cron_schedule,
      cron_timezone: row.cron_timezone,
      run_at: row.run_at,
      action_type: row.action_type,
      action_prompt: row.action_prompt,
      action_source: row.action_source,
      action_target_page: row.action_target_page,
      skills: row.skills,
      is_active: row.is_active,
      status: row.status,
      last_run_at: row.last_run_at,
      last_run_status: row.last_run_status,
      next_run_at: row.next_run_at,
      created_at: row.created_at,
      hostname: row.domains?.hostname,
    }))

    return alrighty("automations", { ok: true, automations, total: automations.length })
  } catch (error) {
    console.error("[Automations API] GET error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}

/**
 * POST /api/automations - Create a new automation
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser()
    if (!user) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    const body = await req.json()

    // Import validators
    const {
      validateRequiredFields,
      validateActionType,
      validateTriggerType,
      validateActionPrompt,
      validateTimeout,
      validateCronSchedule,
      validateTimezone,
      validateSiteId,
    } = await import("@/lib/automation/validation")

    // Step 1: Validate required fields
    const requiredCheck = validateRequiredFields(body, ["site_id", "name", "trigger_type", "action_type"])
    if (!requiredCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { message: `Missing required fields: ${requiredCheck.missing?.join(", ")}` },
      })
    }

    // Step 2: Validate action_type
    const actionTypeCheck = validateActionType(body.action_type)
    if (!actionTypeCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "action_type", message: actionTypeCheck.error },
      })
    }

    // Step 3: Validate trigger_type and trigger-specific fields
    const triggerCheck = validateTriggerType(body.trigger_type, body)
    if (!triggerCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: body.trigger_type, message: triggerCheck.error },
      })
    }

    // Step 4: Validate action_prompt if prompt type
    const promptCheck = validateActionPrompt(body.action_type, body.action_prompt)
    if (!promptCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "action_prompt", message: promptCheck.error },
      })
    }

    // Step 5: Validate timeout if provided
    const timeoutCheck = validateTimeout(body.action_timeout_seconds)
    if (!timeoutCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "action_timeout_seconds", message: timeoutCheck.error },
      })
    }

    // Step 6: Validate timezone if provided
    const tzCheck = validateTimezone(body.cron_timezone)
    if (!tzCheck.valid) {
      return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
        status: 400,
        details: { field: "cron_timezone", message: tzCheck.error },
      })
    }

    // Step 7: Validate site exists and get hostname
    const siteCheck = await validateSiteId(body.site_id)
    if (!siteCheck.valid) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { field: "site_id", message: siteCheck.error },
      })
    }

    const supabase = createServiceAppClient()

    // Get org_id from the site
    const { data: domain } = await supabase.from("domains").select("org_id").eq("domain_id", body.site_id).single()

    if (!domain?.org_id) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404 })
    }

    // Step 8: Validate and compute cron schedule if present
    let nextRunAt: string | null = null
    if (body.trigger_type === "cron" && body.cron_schedule) {
      const cronCheck = validateCronSchedule(body.cron_schedule, body.cron_timezone)
      if (!cronCheck.valid) {
        return structuredErrorResponse(ErrorCodes.INVALID_REQUEST, {
          status: 400,
          details: { field: "cron_schedule", message: cronCheck.error },
        })
      }

      // Compute next_run_at and get preview
      const nextMs = computeNextRunAtMs({ kind: "cron", expr: body.cron_schedule, tz: body.cron_timezone }, Date.now())
      if (nextMs) {
        nextRunAt = new Date(nextMs).toISOString()
      }
    } else if (body.trigger_type === "one-time" && body.run_at) {
      nextRunAt = body.run_at
    }

    // Validate skills if provided (must be array of strings)
    const skills = Array.isArray(body.skills) ? body.skills.filter((s: unknown) => typeof s === "string") : []

    const { data, error } = await supabase
      .from("automation_jobs")
      .insert({
        site_id: body.site_id,
        user_id: user.id,
        org_id: domain.org_id,
        name: body.name,
        description: body.description,
        trigger_type: body.trigger_type,
        cron_schedule: body.cron_schedule,
        cron_timezone: body.cron_timezone,
        run_at: body.run_at,
        action_type: body.action_type,
        action_prompt: body.action_prompt,
        action_source: body.action_source,
        action_target_page: body.action_target_page,
        skills: skills.length > 0 ? skills : [],
        action_model: body.action_model || null,
        is_active: body.is_active ?? true,
        next_run_at: nextRunAt,
      })
      .select()
      .single()

    if (error) {
      console.error("[Automations API] Insert error:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
    }

    // Poke CronService so it picks up the new job immediately
    pokeCronService()

    return alrighty("automations/create", { ok: true, automation: data }, { status: 201 })
  } catch (error) {
    console.error("[Automations API] POST error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
