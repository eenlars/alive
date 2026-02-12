/**
 * Templates API
 * Returns available site templates for deployment.
 *
 * Server-aware: only returns templates whose preview_url is routable
 * from this server (hostname ends with this server's MAIN_DOMAIN).
 *
 * STRICT: Templates MUST exist on every server. If Supabase fails or
 * filtering produces zero results, that's a 500 — not an empty array.
 */

import * as Sentry from "@sentry/nextjs"
import { DOMAINS } from "@webalive/shared"
import { alrighty } from "@/lib/api/server"
import { type AppTemplate, createAppClient } from "@/lib/supabase/app"

/**
 * Filter templates to only those routable from this server.
 * A template is routable if its preview_url hostname matches either
 * DOMAINS.MAIN or DOMAINS.WILDCARD (which may differ, e.g. alive.best vs goalive.nl).
 */
function filterByServer(templates: AppTemplate[]): AppTemplate[] {
  const domains = [DOMAINS.MAIN, DOMAINS.WILDCARD]

  return templates.filter(t => {
    const hostname = new URL(t.preview_url!).hostname
    return domains.some(d => hostname === d || hostname.endsWith(`.${d}`))
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
      throw new Error(`Supabase query failed: ${error.message}`)
    }

    if (!templates || templates.length === 0) {
      throw new Error("No active templates in database — every server must have templates")
    }

    // Every template must have a preview_url
    const missingUrls = templates.filter(t => !t.preview_url)
    if (missingUrls.length > 0) {
      throw new Error(`Templates missing preview_url: ${missingUrls.map(t => t.template_id).join(", ")}`)
    }

    const serverTemplates = filterByServer(templates)

    if (serverTemplates.length === 0) {
      throw new Error(
        `No templates routable from this server (MAIN=${DOMAINS.MAIN}, WILDCARD=${DOMAINS.WILDCARD}). ` +
          `Found ${templates.length} active templates but none match this server's domains.`,
      )
    }

    return alrighty(
      "templates",
      { templates: serverTemplates },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      },
    )
  } catch (error) {
    console.error("[Templates API]", error)
    Sentry.captureException(error)
    throw error
  }
}
