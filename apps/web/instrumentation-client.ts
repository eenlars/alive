import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = "https://84e50be97b3c02134ee7c1e4d60cf8c9@sentry.sonno.tech/2"

/**
 * Derive environment from hostname at runtime.
 * Works on both servers without env vars.
 */
function getEnvironment(): string {
  if (typeof window === "undefined") return "unknown"
  const host = window.location.hostname
  if (host === "localhost" || host === "127.0.0.1") return "local"
  if (host.startsWith("staging.")) return "staging"
  if (host.startsWith("dev.")) return "dev"
  return "production"
}

Sentry.init({
  dsn: SENTRY_DSN,
  environment: getEnvironment(),

  // Send 100% of errors
  sampleRate: 1.0,

  // Performance: sample 10% of transactions on client
  tracesSampleRate: 0.1,

  // Session replay for debugging (1% baseline, 100% on error)
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [Sentry.replayIntegration()],

  // Don't send PII
  sendDefaultPii: false,

  // Strip sensitive URL params
  beforeSend(event) {
    if (event.request?.url) {
      try {
        const url = new URL(event.request.url)
        for (const key of [
          "token",
          "code",
          "password",
          "secret",
          "access_token",
          "refresh_token",
          "api_key",
          "auth_code",
        ]) {
          if (url.searchParams.has(key)) {
            url.searchParams.set(key, "[redacted]")
          }
        }
        event.request.url = url.toString()
      } catch {
        // URL parsing failed, leave as-is
      }
    }
    return event
  },
})
