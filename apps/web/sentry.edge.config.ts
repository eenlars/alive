import * as Sentry from "@sentry/nextjs"

const SENTRY_DSN = "https://84e50be97b3c02134ee7c1e4d60cf8c9@sentry.sonno.tech/2"

if (process.env.PLAYWRIGHT_TEST !== "true") {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.STREAM_ENV ?? process.env.NODE_ENV ?? "unknown",
    sampleRate: 1.0,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,

    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies
        if (event.request.headers) {
          delete event.request.headers.cookie
          delete event.request.headers.authorization
        }
      }
      return event
    },
  })
}
