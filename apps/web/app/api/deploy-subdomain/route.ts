import { existsSync } from "node:fs"
import { COOKIE_NAMES, DEFAULTS, PATHS } from "@webalive/shared"
import { configureCaddy } from "@webalive/site-controller"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { createSessionToken, verifySessionToken } from "@/features/auth/lib/jwt"
import { structuredErrorResponse } from "@/lib/api/responses"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { buildSubdomain } from "@/lib/config"
import { deploySite } from "@/lib/deployment/deploy-site"
import { DomainRegistrationError, registerDomain } from "@/lib/deployment/domain-registry"
import { validateUserOrgAccess } from "@/lib/deployment/org-resolver"
import { validateSSLCertificate } from "@/lib/deployment/ssl-validation"
import { incrementTemplateDeployCount } from "@/lib/deployment/template-stats"
import { validateTemplateFromDb } from "@/lib/deployment/template-validation"
import { getUserQuota, getUserQuotaByEmail } from "@/lib/deployment/user-quotas"
import { ErrorCodes } from "@/lib/error-codes"
import { errorLogger } from "@/lib/error-logger"
import { siteMetadataStore } from "@/lib/siteMetadataStore"
import { loadDomainPasswords } from "@/types/guards/api"

function getPortFromRegistry(domain: string): number | null {
  try {
    const registry = loadDomainPasswords()
    const entry = registry[domain]
    return entry?.port ?? null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get user if authenticated (optional - allows anonymous deployments)
    const sessionUser = await getSessionUser()

    // Parse and validate request body via typed schema
    const parsed = await handleBody("deploy-subdomain", request)
    if (isHandleBodyError(parsed)) return parsed

    const { slug, siteIdeas, templateId, orgId, email, password } = parsed

    // For anonymous users, require authentication (email/password)
    if (!sessionUser && (!email || !password)) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, {
        status: 401,
        details: { message: "Authentication required. Please provide email and password to create an account." },
      })
    }

    // Ensure email is always a string (authenticated users get it from session, anonymous users must provide it)
    const deploymentEmail = sessionUser?.email || email
    if (!deploymentEmail) {
      // This should be caught earlier, but TypeScript needs the check
      return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, {
        status: 400,
        details: { message: "Email is required for deployment" },
      })
    }

    // Validate user has access to specified organization (if provided)
    // If no orgId provided, a default org will be created for the user
    if (sessionUser && orgId) {
      const hasAccess = await validateUserOrgAccess(sessionUser.id, orgId)

      if (!hasAccess) {
        return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, {
          status: 403,
          details: { message: "You do not have access to this organization" },
        })
      }
    }

    // Check site creation limit
    if (sessionUser) {
      const quota = await getUserQuota(sessionUser.id)
      if (!quota.canCreateSite) {
        return structuredErrorResponse(ErrorCodes.SITE_LIMIT_EXCEEDED, {
          status: 403,
          details: { limit: quota.maxSites, currentCount: quota.currentSites },
        })
      }
    } else if (email) {
      const quota = await getUserQuotaByEmail(email)
      if (quota && !quota.canCreateSite) {
        return structuredErrorResponse(ErrorCodes.SITE_LIMIT_EXCEEDED, {
          status: 403,
          details: { limit: quota.maxSites, currentCount: quota.currentSites },
        })
      }
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

    // Execute deployment (systemd + Caddy setup + port assignment)
    await deploySite({
      domain: fullDomain,
      email: deploymentEmail,
      password: sessionUser ? undefined : password,
      orgId,
      templatePath: template.source_path,
    })

    // Read the port that was assigned by the bash script
    const port = getPortFromRegistry(fullDomain)

    if (!port) {
      return structuredErrorResponse(ErrorCodes.DEPLOYMENT_FAILED, {
        status: 500,
        details: {
          message: "Deployment succeeded but port assignment could not be verified. Please contact support.",
        },
      })
    }

    // Register domain in Supabase
    try {
      await registerDomain({
        hostname: fullDomain,
        email: deploymentEmail,
        password: sessionUser ? undefined : password,
        port,
        orgId,
      })
    } catch (registrationError) {
      // DomainRegistrationError includes errorCode and details - use helper
      if (registrationError instanceof DomainRegistrationError) {
        return structuredErrorResponse(registrationError.errorCode, {
          status: 400,
          details: registrationError.details,
        })
      }

      // Fallback for unexpected errors
      throw registrationError
    }

    // Now that domain is in DB, regenerate Caddy routing (avoids race condition
    // where Phase 7 runs before registerDomain writes the domain to Supabase)
    await configureCaddy({
      domain: fullDomain,
      port,
      caddyfilePath: PATHS.CADDYFILE_PATH,
      caddyLockPath: PATHS.CADDY_LOCK,
      flockTimeout: DEFAULTS.FLOCK_TIMEOUT,
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
      ok: true,
      message: `Site ${fullDomain} deployed successfully!`,
      domain: fullDomain,
      orgId,
      chatUrl: `/chat?slug=${slug}`,
    })

    // For authenticated users: regenerate JWT with the new workspace included
    // For anonymous users: don't set session - they'll log in after account creation
    if (sessionUser) {
      const jar = await cookies()
      const sessionCookie = jar.get(COOKIE_NAMES.SESSION)

      if (sessionCookie?.value) {
        // Get current workspaces from JWT and add the new domain
        const payload = await verifySessionToken(sessionCookie.value)
        if (payload) {
          const updatedWorkspaces = [...payload.workspaces, fullDomain]
          const newToken = await createSessionToken(
            sessionUser.id,
            sessionUser.email,
            sessionUser.name,
            updatedWorkspaces,
          )

          res.cookies.set(COOKIE_NAMES.SESSION, newToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            path: "/",
          })
        }
      }
    }

    return res
  } catch (error: unknown) {
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
      usage: 'POST with { "slug": "mysite", "email": "you@example.com", "siteIdeas": "...", "password": "..." }',
      endpoints: {
        deploy: "POST /api/deploy-subdomain",
        getMetadata: "GET /api/sites/metadata?slug=mysite",
      },
    },
    { status: 200 },
  )
}
