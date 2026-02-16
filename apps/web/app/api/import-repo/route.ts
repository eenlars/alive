import { existsSync } from "node:fs"
import * as Sentry from "@sentry/nextjs"
import { COOKIE_NAMES, getOAuthKeyForProvider, PATHS } from "@webalive/shared"
import { DeploymentError } from "@webalive/site-controller"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/features/auth/lib/auth"
import { createSessionToken, verifySessionToken } from "@/features/auth/lib/jwt"
import { structuredErrorResponse } from "@/lib/api/responses"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { buildSubdomain } from "@/lib/config"
import { runStrictDeployment } from "@/lib/deployment/deploy-pipeline"
import { DomainRegistrationError } from "@/lib/deployment/domain-registry"
import { cleanupImportDir, importGithubRepo, parseGithubRepo } from "@/lib/deployment/github-import"
import { validateUserOrgAccess } from "@/lib/deployment/org-resolver"
import { validateSSLCertificate } from "@/lib/deployment/ssl-validation"
import { getUserQuota } from "@/lib/deployment/user-quotas"
import { ErrorCodes } from "@/lib/error-codes"
import { errorLogger } from "@/lib/error-logger"
import { getOAuthInstance } from "@/lib/oauth/oauth-instances"
import { siteMetadataStore } from "@/lib/siteMetadataStore"
import { QUERY_KEYS } from "@/lib/url/queryState"

export async function POST(request: NextRequest) {
  let cleanupDir: string | null = null

  try {
    // Require authenticated session (no anonymous GitHub imports)
    const sessionUser = await getSessionUser()
    if (!sessionUser) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, {
        status: 401,
        details: { message: "Authentication required. Please log in to import a GitHub repository." },
      })
    }

    // Parse and validate request body
    const parsed = await handleBody("import-repo", request)
    if (isHandleBodyError(parsed)) return parsed

    const { slug, repoUrl, branch, orgId, siteIdeas } = parsed

    // Validate org access if orgId provided
    if (orgId) {
      const hasAccess = await validateUserOrgAccess(sessionUser.id, orgId)
      if (!hasAccess) {
        return structuredErrorResponse(ErrorCodes.ORG_ACCESS_DENIED, {
          status: 403,
          details: { message: "You do not have access to this organization" },
        })
      }
    }

    // Check site creation quota
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

    // Check if directory exists (extra safety)
    const siteDir = `${PATHS.SITES_ROOT}/${fullDomain}`
    if (existsSync(siteDir)) {
      return structuredErrorResponse(ErrorCodes.SLUG_TAKEN, {
        status: 409,
        details: { message: "Site directory already exists. Choose a different slug." },
      })
    }

    // Validate repo URL format before anything else
    try {
      parseGithubRepo(repoUrl)
    } catch (error) {
      return structuredErrorResponse(ErrorCodes.VALIDATION_ERROR, {
        status: 400,
        details: { message: error instanceof Error ? error.message : "Invalid repository URL format" },
      })
    }

    // Require GitHub OAuth token — we use the API tarball endpoint which needs auth
    let githubToken: string
    try {
      const githubOAuthKey = getOAuthKeyForProvider("github")
      const githubOAuth = getOAuthInstance(githubOAuthKey)
      const token = await githubOAuth.getAccessToken(sessionUser.id, githubOAuthKey)
      if (!token) {
        return structuredErrorResponse(ErrorCodes.GITHUB_NOT_CONNECTED, {
          status: 400,
          details: { message: "Connect your GitHub account in Settings > Integrations to import repositories." },
        })
      }
      githubToken = token
    } catch {
      return structuredErrorResponse(ErrorCodes.GITHUB_NOT_CONNECTED, {
        status: 400,
        details: { message: "Connect your GitHub account in Settings > Integrations to import repositories." },
      })
    }

    // Download and prepare the repo via GitHub API
    let templatePath: string
    try {
      const result = await importGithubRepo(repoUrl, githubToken, branch)
      templatePath = result.templatePath
      cleanupDir = result.cleanupDir
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown download error"
      return structuredErrorResponse(ErrorCodes.GITHUB_CLONE_FAILED, {
        status: 400,
        details: { message, repoUrl },
      })
    }

    // Deploy using the strict shared pipeline (deploy -> register -> caddy -> verify)
    // Skip build: imported repos are arbitrary — user builds via chat
    await runStrictDeployment({
      domain: fullDomain,
      email: sessionUser.email,
      orgId,
      templatePath,
      skipBuild: true,
    })

    // Save metadata (indicate source is github import)
    await siteMetadataStore.setSite(slug, {
      slug,
      domain: fullDomain,
      workspace: fullDomain,
      email: sessionUser.email,
      siteIdeas,
      source: "github-import",
      sourceRepo: repoUrl,
      createdAt: Date.now(),
    })

    // Fire-and-forget SSL check
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

    const res = alrighty("import-repo", {
      message: `Site ${fullDomain} deployed from GitHub repository!`,
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
      console.error("[Import-Repo] JWT regeneration failed (deployment succeeded):", tokenError)
    }

    return res
  } catch (error: unknown) {
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

    console.error("[Import-Repo] Unexpected error:", error)

    Sentry.captureException(error)

    let status = 500
    if (error && typeof error === "object") {
      if ("code" in error && error.code === "ETIMEDOUT") {
        status = 408
      }
    }

    return structuredErrorResponse(ErrorCodes.DEPLOYMENT_FAILED, {
      status,
      details:
        process.env.NODE_ENV === "development"
          ? { error: error instanceof Error ? error.toString() : String(error) }
          : undefined,
    })
  } finally {
    // Always clean up the temp directory
    if (cleanupDir) {
      try {
        cleanupImportDir(cleanupDir)
      } catch (cleanupError) {
        console.error("[Import-Repo] Failed to clean up temp dir:", cleanupError)
      }
    }
  }
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      message: "Import Repo API is running",
      usage:
        'POST with { "slug": "mysite", "repoUrl": "owner/repo" or "https://github.com/owner/repo", "branch": "main" (optional) }',
    },
    { status: 200 },
  )
}
