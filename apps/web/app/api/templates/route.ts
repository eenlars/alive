/**
 * Templates API
 * Returns all active site templates for deployment.
 *
 * Templates are shared across all servers — both servers host
 * template files locally (synced via git) and serve the same set.
 */

import * as Sentry from "@sentry/nextjs"
import { alrighty } from "@/lib/api/server"
import { createAppClient } from "@/lib/supabase/app"

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
      throw new Error(`[GET /api/templates] app.templates query failed: ${error.message} (code: ${error.code})`)
    }

    if (!templates || templates.length === 0) {
      throw new Error("No active templates in database — every server must have templates")
    }

    // Every template must have a preview_url
    const missingUrls = templates.filter(t => !t.preview_url)
    if (missingUrls.length > 0) {
      throw new Error(`Templates missing preview_url: ${missingUrls.map(t => t.template_id).join(", ")}`)
    }

    return alrighty(
      "templates",
      { templates },
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
