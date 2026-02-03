import { type NextRequest, NextResponse } from "next/server"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { isValidSlug } from "@/features/deployment/lib/slug-utils"
import { ErrorCodes } from "@/lib/error-codes"
import { siteMetadataStore } from "@/lib/siteMetadataStore"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const slug = url.searchParams.get("slug")

  if (!slug) {
    return createErrorResponse(ErrorCodes.MISSING_SLUG, 400)
  }

  // Validate slug format
  if (!isValidSlug(slug)) {
    return createErrorResponse(ErrorCodes.INVALID_SLUG, 400)
  }

  try {
    const metadata = await siteMetadataStore.getSite(slug)

    if (!metadata) {
      return createErrorResponse(ErrorCodes.SITE_NOT_FOUND, 404, { slug })
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

    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }
}
