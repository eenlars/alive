/**
 * Templates API
 * Returns available site templates for deployment.
 *
 * Server-aware: only returns templates whose preview_url is routable
 * from this server (hostname ends with this server's MAIN_DOMAIN).
 */

import { DOMAINS } from "@webalive/shared"
import { NextResponse } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { ErrorCodes } from "@/lib/error-codes"
import { type AppTemplate, createAppClient } from "@/lib/supabase/app"

export interface TemplatesResponse {
  templates: AppTemplate[]
}

/**
 * Filter templates to only those routable from this server.
 * A template is routable if its preview_url hostname matches either
 * DOMAINS.MAIN or DOMAINS.WILDCARD (which may differ, e.g. alive.best vs goalive.nl).
 */
function filterByServer(templates: AppTemplate[]): AppTemplate[] {
  const domains = [DOMAINS.MAIN, DOMAINS.WILDCARD].filter(Boolean)
  if (domains.length === 0) return templates

  return templates.filter(t => {
    if (!t.preview_url) return false
    try {
      const hostname = new URL(t.preview_url).hostname
      return domains.some(d => hostname === d || hostname.endsWith(`.${d}`))
    } catch {
      return false
    }
  })
}

/**
 * GET - Get active templates for this server
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
      return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
        status: 500,
        details: { message: error.message },
      })
    }

    const serverTemplates = filterByServer(templates || [])

    return NextResponse.json(
      { templates: serverTemplates },
      {
        headers: {
          // Cache for 5 minutes, revalidate in background
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    )
  } catch (error) {
    console.error("[Templates API] Unexpected error:", error)
    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, {
      status: 500,
      details: { message: error instanceof Error ? error.message : "Unknown error" },
    })
  }
}
