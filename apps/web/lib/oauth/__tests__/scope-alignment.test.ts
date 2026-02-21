/**
 * Cross-package scope alignment test (issue #131)
 *
 * GoogleProvider.SCOPES (in @webalive/oauth-core) and OAUTH_MCP_PROVIDERS
 * (in @webalive/shared) both declare Google OAuth scopes. If they drift,
 * callback verification (#174) will reject legitimately-requested scopes.
 *
 * This test lives in apps/web because it's the only package that can import
 * both @webalive/oauth-core and @webalive/shared.
 */

import { GoogleProvider } from "@webalive/oauth-core"
import { OAUTH_MCP_PROVIDERS, OAUTH_ONLY_PROVIDERS } from "@webalive/shared"
import { describe, expect, it } from "vitest"

function scopeSet(scopes: string): string[] {
  return scopes.split(" ").filter(Boolean).sort()
}

describe("Google OAuth scope alignment across packages", () => {
  it("GMAIL_MODIFY_SCOPES matches gmail MCP provider defaultScopes", () => {
    expect(scopeSet(GoogleProvider.GMAIL_MODIFY_SCOPES)).toEqual(scopeSet(OAUTH_MCP_PROVIDERS.gmail.defaultScopes))
  })

  it("CALENDAR_SCOPES matches google_calendar MCP provider defaultScopes", () => {
    expect(scopeSet(GoogleProvider.CALENDAR_SCOPES)).toEqual(
      scopeSet(OAUTH_MCP_PROVIDERS.google_calendar.defaultScopes),
    )
  })

  it("Google OAuth-only scopes are the union of Gmail and Calendar profiles", () => {
    const googleOnlyScopes = scopeSet(OAUTH_ONLY_PROVIDERS.google.defaultScopes)
    const gmailScopes = scopeSet(GoogleProvider.GMAIL_MODIFY_SCOPES)
    const calendarScopes = scopeSet(GoogleProvider.CALENDAR_SCOPES)

    // Every scope from both profiles must be present in the combined set
    const expectedUnion = [...new Set([...gmailScopes, ...calendarScopes])].sort()
    expect(googleOnlyScopes).toEqual(expectedUnion)
  })
})
