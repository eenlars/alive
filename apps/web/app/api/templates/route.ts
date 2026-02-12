/**
 * Templates API
 * Returns available site templates for deployment
 */

import * as Sentry from "@sentry/nextjs"
import { NextResponse } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { type AppTemplate, createAppClient } from "@/lib/supabase/app"

export interface TemplatesResponse {
  templates: AppTemplate[]
}

/**
 * GET - Get all active templates
 * Public endpoint - no authentication required
 */
export async function GET() {
  try {
    const supabase = await createAppClient("service")

    const { data: templates, error } = await supabase
      .from("templates")
      .select("*")
      .eq("is_active", true)
      .order("deploy_count", { ascending: false, nullsFirst: false })

    if (error) {
      console.error("[Templates API] Failed to fetch templates:", error)
      Sentry.captureException(error)
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
        status: 500,
        details: { message: error.message },
      })
    }

    return NextResponse.json(
      { templates: templates || [] },
      {
        headers: {
          // Cache for 5 minutes, revalidate in background
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    )
  } catch (error) {
    console.error("[Templates API] Unexpected error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: { message: error instanceof Error ? error.message : "Unknown error" },
    })
  }
}
