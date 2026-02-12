/**
 * Next.js Instrumentation
 *
 * This file is loaded when the Next.js server starts.
 * Used to validate environment at startup.
 *
 * NOTE: CronService (automation scheduling) has moved to apps/worker,
 * a standalone Bun process managed by systemd. See CLAUDE.md for details.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on the server, not during build
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Initializing server-side services...")

    // Validate critical environment variables at startup
    try {
      const { getSuperadminEmails, getRedisUrl } = await import("@webalive/env/server")

      // These will throw if not configured correctly in production/staging
      const superadmins = getSuperadminEmails()
      const _redisUrl = getRedisUrl()

      console.log(`[Instrumentation] Environment validated: ${superadmins.length} superadmin(s) configured`)
    } catch (error) {
      console.error("[Instrumentation] CRITICAL: Environment validation failed:", error)
      // In production, this is fatal - the app won't function correctly
      if (process.env.NODE_ENV === "production") {
        process.exit(1)
      }
    }

    console.log("[Instrumentation] Server-side services initialized")
  }
}
