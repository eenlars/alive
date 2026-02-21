import * as Sentry from "@sentry/nextjs"
import { DEFAULTS, PATHS } from "@webalive/shared"
import { configureCaddy, DeploymentError, regeneratePortMap, SiteOrchestrator } from "@webalive/site-controller"
import { AuthenticationError, requireSessionUser } from "@/features/auth/lib/auth"
import { structuredErrorResponse } from "@/lib/api/responses"
import { alrighty, handleBody, isHandleBodyError } from "@/lib/api/server"
import { ErrorCodes } from "@/lib/error-codes"
import { createAppClient } from "@/lib/supabase/app"

export async function POST(request: Request) {
  try {
    const user = await requireSessionUser()

    if (!user.isSuperadmin) {
      return structuredErrorResponse(ErrorCodes.FORBIDDEN, {
        status: 403,
        details: { message: "Only superadmins can rename sites" },
      })
    }

    const parsed = await handleBody("rename-site", request as never)
    if (isHandleBodyError(parsed)) return parsed

    const { oldDomain, newDomain } = parsed

    // Look up the domain in the DB
    const app = await createAppClient("service")
    const { data: domain, error: lookupError } = await app
      .from("domains")
      .select("domain_id, hostname, port")
      .eq("hostname", oldDomain)
      .single()

    if (lookupError || !domain) {
      return structuredErrorResponse(ErrorCodes.SITE_NOT_FOUND, {
        status: 404,
        details: { message: `Domain not found: ${oldDomain}` },
      })
    }

    // Check new domain doesn't already exist
    const { data: existing } = await app.from("domains").select("domain_id").eq("hostname", newDomain).single()

    if (existing) {
      return structuredErrorResponse(ErrorCodes.DOMAIN_ALREADY_EXISTS, {
        status: 409,
        details: { message: `Domain already exists: ${newDomain}` },
      })
    }

    // Phase 1: OS-level rename (user, dir, symlink, systemd, env)
    const result = await SiteOrchestrator.rename({ oldDomain, newDomain })

    if (!result.success) {
      return structuredErrorResponse(ErrorCodes.RENAME_FAILED, {
        status: 500,
        details: { message: result.error || "OS rename failed" },
      })
    }

    // Phase 2: Update hostname in database
    const { error: updateError } = await app
      .from("domains")
      .update({ hostname: newDomain })
      .eq("domain_id", domain.domain_id)

    if (updateError) {
      // DB update failed but OS already renamed — log and return error
      console.error(`[Rename] DB update failed after OS rename: ${updateError.message}`)
      Sentry.captureException(updateError)
      return structuredErrorResponse(ErrorCodes.RENAME_FAILED, {
        status: 500,
        details: { message: `OS renamed but DB update failed: ${updateError.message}` },
      })
    }

    // Phase 3: Regenerate Caddy routing + port map
    await regeneratePortMap(newDomain)

    await configureCaddy({
      domain: newDomain,
      port: domain.port,
      caddyfilePath: PATHS.CADDYFILE_PATH,
      caddyLockPath: PATHS.CADDY_LOCK,
      flockTimeout: DEFAULTS.FLOCK_TIMEOUT,
    })

    return alrighty("rename-site", {
      message: `Site renamed: ${oldDomain} → ${newDomain}`,
      oldDomain,
      newDomain,
    })
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return structuredErrorResponse(ErrorCodes.UNAUTHORIZED, { status: 401 })
    }

    if (error instanceof DeploymentError) {
      return structuredErrorResponse(ErrorCodes.RENAME_FAILED, {
        status: error.statusCode,
        details: { message: error.message, code: error.code },
      })
    }

    console.error("[Rename] Unexpected error:", error)
    Sentry.captureException(error)
    return structuredErrorResponse(ErrorCodes.RENAME_FAILED, {
      status: 500,
      details:
        process.env.NODE_ENV === "development"
          ? { error: error instanceof Error ? error.message : String(error) }
          : undefined,
    })
  }
}
