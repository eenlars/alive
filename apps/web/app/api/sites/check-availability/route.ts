import { existsSync } from "node:fs"
import path from "node:path"
import { type NextRequest, NextResponse } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { validateSlug } from "@/features/deployment/lib/slug-utils"
import { buildSubdomain, WORKSPACE_BASE } from "@/lib/config"
import { ErrorCodes } from "@/lib/error-codes"

interface AvailabilityResponse {
  available: boolean
  slug?: string
  error?: string
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.toLowerCase()

  if (!slug) {
    return structuredErrorResponse(ErrorCodes.MISSING_SLUG, { status: 400 })
  }

  const validation = validateSlug(slug)
  if (!validation.valid) {
    return structuredErrorResponse(ErrorCodes.INVALID_SLUG, { status: 400, details: { error: validation.error } })
  }

  // Check if domain directory exists
  const fullDomain = buildSubdomain(slug)
  const sitePath = path.join(WORKSPACE_BASE, fullDomain)
  const exists = existsSync(sitePath)

  console.log(
    `[Availability] Checking slug "${slug}" -> domain "${fullDomain}" -> path "${sitePath}" -> exists: ${exists}`,
  )

  return NextResponse.json({ available: !exists, slug } as AvailabilityResponse, { status: 200 })
}
