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

    // Only start services in production to avoid duplicate schedulers in staging/dev
    const bridgeEnv = process.env.STREAM_ENV
    const isProduction = bridgeEnv ? bridgeEnv === "production" : process.env.NODE_ENV === "production"

    // Start the pg-boss job queue (replaces CronService for scheduling)
    // Handles: automation execution, conversation resumption
    try {
      if (isProduction) {
        const { startJobQueue } = await import("@webalive/job-queue")
        await startJobQueue(event => {
          console.log(`[JobQueue Event] ${event.queue}/${event.action}:`, {
            jobId: event.jobId,
            durationMs: event.durationMs,
            error: event.error,
          })
        })
        console.log(`[Instrumentation] JobQueue started (STREAM_ENV=${bridgeEnv ?? "unset"})`)

        // Sync existing automation schedules from Supabase to pg-boss
        const { syncAutomationSchedules } = await import("@/lib/automation/sync-schedules")
        await syncAutomationSchedules()
        console.log("[Instrumentation] Automation schedules synced to pg-boss")
      } else {
        console.log(`[Instrumentation] JobQueue disabled (STREAM_ENV=${bridgeEnv ?? "unset"})`)
      }
    } catch (error) {
      console.error("[Instrumentation] Failed to start JobQueue:", error)
      // Don't crash the server if JobQueue fails to start
    }

    console.log("[Instrumentation] Server-side services initialized")
  }
}
