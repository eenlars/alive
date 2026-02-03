import { existsSync } from "node:fs"
import path from "node:path"
import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
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
    return createErrorResponse(ErrorCodes.MISSING_SLUG, 400)
  }

  const validation = validateSlug(slug)
  if (!validation.valid) {
    return createErrorResponse(ErrorCodes.INVALID_SLUG, 400, { error: validation.error })
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
