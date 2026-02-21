/**
 * Tests the actual server-side beforeSend filter used by both
 * sentry.server.config.ts and sentry.edge.config.ts.
 *
 * Imports the real function — if prod logic drifts, this test breaks.
 */
import type { ErrorEvent } from "@sentry/nextjs"
import { describe, expect, it } from "vitest"
import { serverBeforeSend } from "../sentry/server-before-send"

function makeEvent(message: string, env = "production"): ErrorEvent {
  return {
    type: undefined,
    environment: env,
    exception: { values: [{ value: message, type: "Error" }] },
  }
}

describe("serverBeforeSend filter", () => {
  it("drops BodyStreamBuffer abort errors", () => {
    expect(serverBeforeSend(makeEvent("BodyStreamBuffer was aborted"))).toBeNull()
  })

  it("keeps generic 'The operation was aborted' (real timeout)", () => {
    expect(serverBeforeSend(makeEvent("The operation was aborted"))).not.toBeNull()
  })

  it("keeps AbortError from fetch (server-side fetch timeout)", () => {
    expect(serverBeforeSend(makeEvent("AbortError: signal timed out"))).not.toBeNull()
  })

  it("keeps database connection errors", () => {
    expect(serverBeforeSend(makeEvent("connection to server at 127.0.0.1 refused"))).not.toBeNull()
  })

  it("keeps generic internal errors", () => {
    expect(serverBeforeSend(makeEvent("Cannot read properties of undefined"))).not.toBeNull()
  })

  it("drops local environment events", () => {
    expect(serverBeforeSend(makeEvent("some error", "local"))).toBeNull()
  })

  it("strips cookies and auth headers from requests", () => {
    const event: ErrorEvent = {
      type: undefined,
      environment: "production",
      request: {
        url: "https://app.alive.best/api/test",
        cookies: { session: "secret" },
        headers: {
          cookie: "session=secret",
          authorization: "Bearer token",
          "content-type": "application/json",
        },
      },
    }
    const result = serverBeforeSend(event)
    expect(result).not.toBeNull()
    expect(result!.request!.cookies).toBeUndefined()
    expect(result!.request!.headers!.cookie).toBeUndefined()
    expect(result!.request!.headers!.authorization).toBeUndefined()
    expect(result!.request!.headers!["content-type"]).toBe("application/json")
  })
})
