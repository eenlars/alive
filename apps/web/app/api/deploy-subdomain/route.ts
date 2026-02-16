import { existsSync } from "node:fs"
import { COOKIE_NAMES, PATHS } from "@webalive/shared"
import { DeploymentError } from "@webalive/site-controller"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { AuthenticationError, requireSessionUser } from "@/features/auth/lib/auth"
import { createSessionToken, verifySessionToken } from "@/features/auth/lib/jwt"
import { structuredErrorResponse } from "@/lib/api/responses"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { buildSubdomain } from "@/lib/config"
import { runStrictDeployment } from "@/lib/deployment/deploy-pipeline"
import { DomainRegistrationError } from "@/lib/deployment/domain-registry"
import { validateUserOrgAccess } from "@/lib/deployment/org-resolver"
import { validateSSLCertificate } from "@/lib/deployment/ssl-validation"
import { incrementTemplateDeployCount } from "@/lib/deployment/template-stats"
import { validateTemplateFromDb } from "@/lib/deployment/template-validation"
import { getUserQuota } from "@/lib/deployment/user-quotas"
import { ErrorCodes } from "@/lib/error-codes"
import { errorLogger } from "@/lib/error-logger"
import { siteMetadataStore } from "@/lib/siteMetadataStore"
import { QUERY_KEYS } from "@/lib/url/queryState"

export async function POST(request: NextRequest) {
  try {
    // Authenticated deployments only
    const sessionUser = await requireSessionUser()

    // Parse and validate request body via typed schema
    const parsed = await handleBody("deploy-subdomain", request)
    if (isHandleBodyError(parsed)) return parsed

    const { slug, siteIdeas, templateId, orgId } = parsed
    const deploymentEmail = sessionUser.email

    // Validate user has access to specified organization (if provided)
    // If no orgId provided, a default org will be created for the user
    if (orgId) {
      const hasAccess = await validateUserOrgAccess(sessionUser.id, orgId)

      if (!hasAccess) {
        return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, {
          status: 403,
          details: { message: "You do not have access to this organization" },
        })
      }
    }

    // Check site creation limit
    const quota = await getUserQuota(sessionUser.id)
    if (!quota.canCreateSite) {
      return structuredErrorResponse(ErrorCodes.SITE_LIMIT_EXCEEDED, {
        status: 403,
        details: { limit: quota.maxSites, currentCount: quota.currentSites },
      })
    }

    // Build full domain from slug
    const fullDomain = buildSubdomain(slug)

    // Check if slug already exists
    const slugExists = await siteMetadataStore.exists(slug)
    if (slugExists) {
      return structuredErrorResponse(ErrorCodes.SLUG_TAKEN, {
        status: 409,
        details: { message: `Subdomain "${slug}" is already taken. Choose a different name.` },
      })
    }

    // Also check if directory exists (extra safety)
    const siteDir = `${PATHS.SITES_ROOT}/${fullDomain}`
    if (existsSync(siteDir)) {
      return structuredErrorResponse(ErrorCodes.SLUG_TAKEN, {
        status: 409,
        details: { message: "Site directory already exists. Choose a different slug." },
      })
    }

    // Validate template exists in database and on disk
    const templateValidation = await validateTemplateFromDb(templateId)
    if (!templateValidation.valid || !templateValidation.template) {
      const error = templateValidation.error!
      return structuredErrorResponse(
        error.code === "INVALID_TEMPLATE" ? ErrorCodes.INVALID_TEMPLATE : ErrorCodes.TEMPLATE_NOT_FOUND,
        {
          status: 400,
          details: {
            templateId: error.templateId,
            message: error.message,
          },
        },
      )
    }
    const template = templateValidation.template

    // Execute strict deployment pipeline (deploy -> register -> caddy -> verify)
    await runStrictDeployment({
      domain: fullDomain,
      email: deploymentEmail,
      orgId,
      templatePath: template.source_path,
    })

    // Save metadata
    await siteMetadataStore.setSite(slug, {
      slug,
      domain: fullDomain,
      workspace: fullDomain,
      email: deploymentEmail,
      siteIdeas,
      templateId: template.template_id,
      createdAt: Date.now(),
    })

    // Increment template deploy count (fire and forget - don't block deployment)
    if (templateId) {
      incrementTemplateDeployCount(templateId).catch(err => {
        console.error("[Deploy-Subdomain] Failed to increment template deploy count:", err)
      })
    }

    // Fire-and-forget SSL check - deployment already succeeded, this is just logging
    // Cloudflare domains can take 30-60s for edge cert provisioning, don't block on it
    if (process.env.SKIP_SSL_VALIDATION !== "true") {
      validateSSLCertificate(fullDomain).catch(err => {
        errorLogger.capture({
          category: "deployment",
          source: "backend",
          message: `SSL check failed for ${fullDomain} (non-blocking)`,
          details: { domain: fullDomain, error: err instanceof Error ? err.message : String(err) },
        })
      })
    }

    const res = alrighty("deploy-subdomain", {
      message: `Site ${fullDomain} deployed successfully!`,
      domain: fullDomain,
      orgId,
      chatUrl: `/chat?${QUERY_KEYS.workspace}=${encodeURIComponent(fullDomain)}`,
    })

    // Regenerate JWT with updated org membership if a new org was associated
    try {
      const jar = await cookies()
      const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

      if (sessionCookie?.value) {
        const payload = await verifySessionToken(sessionCookie.value)
        if (payload) {
          const isNewOrg = orgId && !payload.orgIds.includes(orgId)
          const updatedOrgIds = isNewOrg ? [...payload.orgIds, orgId] : payload.orgIds
          const updatedOrgRoles = isNewOrg ? { ...payload.orgRoles, [orgId]: "owner" as const } : payload.orgRoles

          const newToken = await createSessionToken({
            userId: sessionUser.id,
            email: sessionUser.email,
            name: sessionUser.name,
            scopes: payload.scopes,
            orgIds: updatedOrgIds,
            orgRoles: updatedOrgRoles,
          })

          res.cookies.set(COOKIE_NAMES.SESSION, newToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            path: "/",
          })
        }
      }
    } catch (tokenError) {
      console.error("[Deploy-Subdomain] JWT regeneration failed (deployment succeeded):", tokenError)
    }

    return res
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, {
        status: 401,
      })
    }

    if (error instanceof DomainRegistrationError) {
      const status = error.errorCode === ErrorCodes.DOMAIN_ALREADY_EXISTS ? 409 : 400
      return structuredErrorResponse(error.errorCode, {
        status,
        details: error.details,
      })
    }

    if (error instanceof DeploymentError) {
      return structuredErrorResponse(ErrorCodes.DEPLOYMENT_FAILED, {
        status: error.statusCode,
        details: { message: error.message, code: error.code },
      })
    }

    console.error("[Deploy-Subdomain] Unexpected error:", error)

    // Determine appropriate status code based on error type
    let status = 500
    if (error && typeof error === "object") {
      if ("code" in error && error.code === "ETIMEDOUT") {
        status = 408 // Request Timeout
      } else if (("code" in error && error.code === 12) || "stderr" in error) {
        status = 400 // Bad Request (DNS validation, script errors)
      }
    }

    return structuredErrorResponse(ErrorCodes.DEPLOYMENT_FAILED, {
      status,
      details:
        process.env.NODE_ENV === "development"
          ? { error: error instanceof Error ? error.toString() : String(error) }
          : undefined,
    })
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      message: "Deploy Subdomain API is running",
      usage: 'POST with { "slug": "mysite", "siteIdeas": "...", "templateId": "tmpl_blank", "orgId": "org-123" }',
      endpoints: {
        deploy: "POST /api/deploy-subdomain",
        getMetadata: "GET /api/sites/metadata?slug=mysite",
      },
    },
    { status: 200 },
  )
}
