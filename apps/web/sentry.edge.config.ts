import * as Sentry from "@sentry/nextjs"
import { serverBeforeSend } from "./lib/sentry/server-before-send"

const SENTRY_DSN = "https://84e50be97b3c02134ee7c1e4d60cf8c9@sentry.sonno.tech/2"

if (process.env.PLAYWRIGHT_TEST !== "true") {
  Sentry.init({
    dsn: SENTRY_DSN,
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? "unknown",
    environment: process.env.STREAM_ENV ?? process.env.NODE_ENV ?? "unknown",
    sampleRate: 1.0,
    tracesSampleRate: 0.2,
    sendDefaultPii: false,

    beforeSend: serverBeforeSend,
  })
}
