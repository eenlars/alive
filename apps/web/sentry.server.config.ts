import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = "https://84e50be97b3c02134ee7c1e4d60cf8c9@sentry.sonno.tech/2"

if (process.env.PLAYWRIGHT_TEST !== "true") {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.STREAM_ENV ?? process.env.NODE_ENV ?? "unknown",
    serverName: process.env.MAIN_DOMAIN ?? "unknown",

    // Send 100% of errors
    sampleRate: 1.0,

    // Performance: sample 20% of transactions
    tracesSampleRate: 0.2,

    // Don't send PII
    sendDefaultPii: false,

    // Don't send events from local dev
    beforeSend(event) {
      if (event.environment === "local") {
        return null
      }

      // Strip cookies
      if (event.request) {
        delete event.request.cookies
        // Strip auth headers
        if (event.request.headers) {
          delete event.request.headers.cookie
          delete event.request.headers.authorization
        }
      }
      return event
    },
  })
}
