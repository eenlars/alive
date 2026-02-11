/**
 * Next.js Instrumentation
 *
 * This file is loaded when the Next.js server starts.
 * Used to initialize background services like the CronService.
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
      console.error("[Instrumentation] ❌ CRITICAL: Environment validation failed:", error)
      // In production, this is fatal - the app won't function correctly
      if (process.env.NODE_ENV === "production") {
        process.exit(1)
      }
    }

    const bridgeEnv = process.env.STREAM_ENV
    const isProduction = bridgeEnv === "production"

    // Only production runs CronService — staging and dev share the same DB,
    // so multiple schedulers would cause duplicate job execution
    try {
      const { startCronService } = await import("@/lib/automation/cron-service")

      if (isProduction) {
        await startCronService({
          enabled: isProduction,
          maxConcurrent: 3,
          maxRetries: 3,
          retryBaseDelayMs: 60_000,
          onEvent: event => {
            // Log events for debugging
            console.log(`[CronService Event] ${event.action}:`, {
              jobId: event.jobId,
              status: event.status,
              durationMs: event.durationMs,
              error: event.error,
            })
          },
        })
        console.log(`[Instrumentation] CronService started (STREAM_ENV=${bridgeEnv ?? "unset"})`)
      } else {
        console.log(`[Instrumentation] CronService disabled (STREAM_ENV=${bridgeEnv ?? "unset"})`)
      }
    } catch (error) {
      console.error("[Instrumentation] Failed to start CronService:", error)
      // Don't crash the server if CronService fails to start
    }

    console.log("[Instrumentation] Server-side services initialized")
  }
}
