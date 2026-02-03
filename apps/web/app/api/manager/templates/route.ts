import { type NextRequest, NextResponse } from "next/server"
import { requireManagerAuth } from "@/features/manager/lib/api-helpers"
import { createCorsErrorResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { addCorsHeaders } from "@/lib/cors-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { type AppTemplateInsert, createAppClient } from "@/lib/supabase/app"

/**
 * GET /api/manager/templates
 * Fetch all templates (requires manager authentication)
 */
export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")

  try {
    const authError = await requireManagerAuth()
    if (authError) {
      return authError
    }

    const supabase = await createAppClient("service")
    const { data: templates, error } = await supabase
      .from("templates")
      .select("*")
      .order("deploy_count", { ascending: false, nullsFirst: false })

    if (error) {
      console.error("[Manager] Error fetching templates:", error)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
        details: { message: error.message },
      })
    }

    return createCorsSuccessResponse(origin, {
      templates: templates ?? [],
      count: templates?.length ?? 0,
    })
  } catch (error) {
    console.error("[Manager] Error fetching templates:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
      details: { message: error instanceof Error ? error.message : "Unknown error" },
    })
  }
}

/**
 * POST /api/manager/templates
 * Create a new template (requires manager authentication)
 */
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin")

  try {
    const authError = await requireManagerAuth()
    if (authError) {
      return authError
    }

    const body = await req.json()
    const { template_id, name, description, ai_description, source_path, preview_url, image_url, is_active } = body

    if (!name || !source_path) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, {
        details: { message: "name and source_path are required" },
      })
    }

    const supabase = await createAppClient("service")

    const insertData: AppTemplateInsert = {
      name,
      source_path,
      description: description ?? null,
      ai_description: ai_description ?? null,
      preview_url: preview_url ?? null,
      image_url: image_url ?? null,
      is_active: is_active ?? true,
      deploy_count: 0,
      ...(template_id ? { template_id } : {}),
    }

    const { data: template, error } = await supabase.from("templates").insert(insertData).select().single()

    if (error) {
      console.error("[Manager] Error creating template:", error)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
        details: { message: error.message },
      })
    }

    return createCorsSuccessResponse(origin, { template })
  } catch (error) {
    console.error("[Manager] Error creating template:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
      details: { message: error instanceof Error ? error.message : "Unknown error" },
    })
  }
}

/**
 * PUT /api/manager/templates
 * Update an existing template (requires manager authentication)
 */
export async function PUT(req: NextRequest) {
  const origin = req.headers.get("origin")

  try {
    const authError = await requireManagerAuth()
    if (authError) {
      return authError
    }

    const body = await req.json()
    const { template_id, ...updates } = body

    if (!template_id) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, {
        details: { message: "template_id is required" },
      })
    }

    const supabase = await createAppClient("service")
    const { data: template, error } = await supabase
      .from("templates")
      .update(updates)
      .eq("template_id", template_id)
      .select()
      .single()

    if (error) {
      console.error("[Manager] Error updating template:", error)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
        details: { message: error.message },
      })
    }

    return createCorsSuccessResponse(origin, { template })
  } catch (error) {
    console.error("[Manager] Error updating template:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
      details: { message: error instanceof Error ? error.message : "Unknown error" },
    })
  }
}

/**
 * DELETE /api/manager/templates
 * Delete a template (requires manager authentication)
 */
export async function DELETE(req: NextRequest) {
  const origin = req.headers.get("origin")

  try {
    const authError = await requireManagerAuth()
    if (authError) {
      return authError
    }

    const { searchParams } = new URL(req.url)
    const template_id = searchParams.get("template_id")

    if (!template_id) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, {
        details: { message: "template_id query parameter is required" },
      })
    }

    const supabase = await createAppClient("service")
    const { error } = await supabase.from("templates").delete().eq("template_id", template_id)

    if (error) {
      console.error("[Manager] Error deleting template:", error)
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
        details: { message: error.message },
      })
    }

    return createCorsSuccessResponse(origin, { deleted: true, template_id })
  } catch (error) {
    console.error("[Manager] Error deleting template:", error)
    return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
      details: { message: error instanceof Error ? error.message : "Unknown error" },
    })
  }
}

/**
 * OPTIONS /api/manager/templates
 * CORS preflight
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin")
  const res = new NextResponse(null, { status: 204 })
  addCorsHeaders(res, origin)
  return res
}
