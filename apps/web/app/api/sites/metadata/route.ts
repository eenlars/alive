import * as Sentry from "@sentry/nextjs"
import { type NextRequest, NextResponse } from "next/server"
import { structuredErrorResponse } from "@/lib/api/responses"
import { isValidSlug } from "@/features/deployment/lib/slug-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { siteMetadataStore } from "@/lib/siteMetadataStore"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const slug = url.searchParams.get("slug")

  if (!slug) {
    return structuredErrorResponse(ErrorCodes.MISSING_SLUG, { status: 400 })
  }

  // Validate slug format
  if (!isValidSlug(slug)) {
    return structuredErrorResponse(ErrorCodes.INVALID_SLUG, { status: 400 })
  }

  try {
    const metadata = await siteMetadataStore.getSite(slug)

    if (!metadata) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, { status: 404, details: { slug } })
    }

    return NextResponse.json(
      {
        ok: true,
        metadata,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error(`[Metadata API] Failed to fetch metadata for slug ${slug}:`, error)
    Sentry.captureException(error)

    return structuredErrorResponse(ErrorCodes.INTERNAL_ERROR, { status: 500 })
  }
}
