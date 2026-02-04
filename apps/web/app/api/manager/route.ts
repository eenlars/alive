import { exec } from "node:child_process"
import { promisify } from "node:util"
import { DOMAINS, PATHS } from "@webalive/shared"
import { type NextRequest, NextResponse } from "next/server"
import { requireManagerAuth } from "@/features/manager/lib/api-helpers"
import { createCorsErrorResponse, createCorsResponse, createCorsSuccessResponse } from "@/lib/api/responses"
import { updateDomainOwnerPassword } from "@/lib/auth/supabase-passwords"
import { addCorsHeaders } from "@/lib/cors-utils"
import { getAllDomains } from "@/lib/deployment/domain-registry"
import { ErrorCodes } from "@/lib/error-codes"
import { updateOrgCredits } from "@/lib/tokens"
import { generateRequestId } from "@/lib/utils"
import type { DomainConfigClient } from "@/types/domain"

const execAsync = promisify(exec)

async function detectOrphanedDomains(): Promise<string[]> {
  const orphaned = new Set<string>()

  try {
    const { stdout: services } = await execAsync("systemctl list-units 'site@*.service' --no-legend --no-pager")
    const serviceMatches = services.matchAll(/site@([a-zA-Z0-9-]+)\.service/g)
    for (const match of serviceMatches) {
      const slug = match[1]
      const domain = slug.replace(/-/g, ".")
      orphaned.add(domain)
    }
  } catch {
    // Ignore systemctl errors
  }

  try {
    const { stdout: caddyContent } = await execAsync(`cat ${PATHS.CADDYFILE_PATH}`)
    const caddyMatches = caddyContent.matchAll(/^([a-zA-Z0-9.-]+)\s+\{/gm)
    for (const match of caddyMatches) {
      orphaned.add(match[1])
    }
  } catch {
    // Ignore Caddyfile read errors
  }

  return Array.from(orphaned)
}

function isPreviewDomain(domain: string): boolean {
  return domain.includes(`.${DOMAINS.PREVIEW_BASE}`)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin")

  const authError = await requireManagerAuth()
  if (authError) {
    return authError
  }

  // Load all domains from Supabase (includes port, credits, email)
  const allDomains = await getAllDomains()
  const orphanedDomains = await detectOrphanedDomains()

  const sanitizedDomains: Record<string, DomainConfigClient> = {}

  // Add all domains from Supabase with full info
  for (const domainInfo of allDomains) {
    // Skip preview domains
    if (isPreviewDomain(domainInfo.hostname)) {
      continue
    }

    sanitizedDomains[domainInfo.hostname] = {
      port: domainInfo.port,
      email: domainInfo.ownerEmail,
      orgId: domainInfo.orgId,
      credits: domainInfo.credits,
    }
  }

  // Add orphaned domains (not in Supabase)
  for (const domain of orphanedDomains) {
    // Skip preview domains
    if (isPreviewDomain(domain)) {
      continue
    }

    if (!sanitizedDomains[domain]) {
      sanitizedDomains[domain] = {
        orphaned: true,
        credits: 0,
      }
    }
  }

  return createCorsSuccessResponse(origin, { domains: sanitizedDomains })
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin")
  const requestId = generateRequestId()

  const authError = await requireManagerAuth()
  if (authError) {
    return authError
  }

  try {
    const body = await req.json()
    const { domain: rawDomain, password, email, credits } = body
    const domain = rawDomain?.toLowerCase() // Always lowercase domain

    if (!domain) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    // Update credits in Supabase if provided
    if (credits !== undefined) {
      if (typeof credits !== "number" || credits < 0) {
        return createCorsResponse(
          origin,
          {
            ok: false,
            error: ErrorCodes.INVALID_REQUEST,
            message: "Credits must be a non-negative number",
            requestId,
          },
          400,
        )
      }

      const success = await updateOrgCredits(domain, credits)
      if (!success) {
        return createCorsResponse(
          origin,
          {
            ok: false,
            error: ErrorCodes.INVALID_REQUEST,
            message: "Failed to update credits (domain or org not found)",
            requestId,
          },
          404,
        )
      }
    }

    // Update password/email in Supabase
    if (password) {
      const passwordSuccess = await updateDomainOwnerPassword(domain, password)
      if (!passwordSuccess) {
        return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, { requestId })
      }
    }

    if (email !== undefined) {
      // Note: This updates the email for the domain owner
      // If you need to update a specific user's email, you'll need to pass the old email
      console.warn("[Manager] Email update via domain not yet implemented - need old email address")
    }

    return createCorsSuccessResponse(origin, { requestId })
  } catch (_error) {
    return createCorsErrorResponse(origin, ErrorCodes.INVALID_JSON, 400, { requestId })
  }
}

export async function DELETE(req: NextRequest) {
  const origin = req.headers.get("origin")
  const requestId = generateRequestId()

  const authError = await requireManagerAuth()
  if (authError) {
    return authError
  }

  try {
    const body = await req.json()
    const { domain: rawDomain } = body
    const domain = rawDomain?.toLowerCase() // Always lowercase domain

    if (!domain) {
      return createCorsErrorResponse(origin, ErrorCodes.INVALID_REQUEST, 400, { requestId })
    }

    try {
      const { stdout, stderr } = await execAsync(`${PATHS.STREAM_ROOT}/scripts/sites/delete-site.sh ${domain} --force`)
      return createCorsSuccessResponse(origin, { output: stdout, error: stderr || null, requestId })
    } catch (error) {
      return createCorsErrorResponse(origin, ErrorCodes.INTERNAL_ERROR, 500, {
        requestId,
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  } catch (_error) {
    return createCorsErrorResponse(origin, ErrorCodes.INVALID_JSON, 400, { requestId })
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || req.headers.get("referer")?.split("/").slice(0, 3).join("/")
  const res = new NextResponse(null, { status: 204 })
  addCorsHeaders(res, origin ?? null)
  return res
}
