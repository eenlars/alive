import * as Sentry from "@sentry/node"

const SENTRY_DSN = "https://84e50be97b3c02134ee7c1e4d60cf8c9@sentry.sonno.tech/2"

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV ?? "production",
  serverName: "stealth-request",
  sampleRate: 1.0,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
})

export { Sentry }
