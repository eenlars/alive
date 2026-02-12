/**
 * OAuth Token Reader for the Worker
 *
 * Reads the OAuth access token from ~/.claude/.credentials.json.
 * The web app handles token refresh; the worker just reads the current token.
 * If the token is expired, attempts a refresh (same logic as web).
 *
 * Uses proper-lockfile to coordinate with the web app's refresh.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import lockfile from "proper-lockfile"

const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"
const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000
const CLAUDE_CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json")

const LOCK_OPTIONS = {
  retries: { retries: 10, factor: 2, minTimeout: 200, maxTimeout: 2000 },
  stale: 30_000,
}

interface Credentials {
  oauth_access_token?: string
  oauth_refresh_token?: string
  oauth_expires_at?: string
}

function readCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, "utf-8")
    return JSON.parse(raw) as Credentials
  } catch {
    return null
  }
}

function writeCredentials(creds: Credentials): void {
  fs.writeFileSync(CLAUDE_CREDENTIALS_PATH, JSON.stringify(creds, null, 2), "utf-8")
}

function isTokenExpired(creds: Credentials): boolean {
  if (!creds.oauth_expires_at) return true
  return new Date(creds.oauth_expires_at).getTime() - TOKEN_EXPIRY_BUFFER_MS < Date.now()
}

async function refreshToken(creds: Credentials): Promise<string | null> {
  if (!creds.oauth_refresh_token) return null

  try {
    const resp = await fetch(ANTHROPIC_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: creds.oauth_refresh_token,
        client_id: ANTHROPIC_CLIENT_ID,
      }),
    })

    if (!resp.ok) {
      console.error(`[Worker OAuth] Refresh failed: ${resp.status}`)
      return null
    }

    const data = (await resp.json()) as { access_token: string; refresh_token?: string; expires_in: number }
    const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString()

    writeCredentials({
      ...creds,
      oauth_access_token: data.access_token,
      oauth_refresh_token: data.refresh_token ?? creds.oauth_refresh_token,
      oauth_expires_at: expiresAt,
    })

    console.log("[Worker OAuth] Token refreshed successfully")
    return data.access_token
  } catch (err) {
    console.error("[Worker OAuth] Refresh error:", err)
    return null
  }
}

/**
 * Get a valid OAuth access token.
 * Reads from credentials file, refreshes if expired.
 */
export async function getAccessToken(): Promise<string | null> {
  const creds = readCredentials()
  if (!creds?.oauth_access_token) {
    console.error("[Worker OAuth] No credentials found")
    return null
  }

  if (!isTokenExpired(creds)) {
    return creds.oauth_access_token
  }

  // Token expired — try refresh with file lock
  console.log("[Worker OAuth] Token expired, refreshing...")
  let release: (() => Promise<void>) | null = null
  try {
    release = await lockfile.lock(CLAUDE_CREDENTIALS_PATH, LOCK_OPTIONS)

    // Re-read after acquiring lock (another process may have refreshed)
    const freshCreds = readCredentials()
    if (freshCreds && !isTokenExpired(freshCreds)) {
      return freshCreds.oauth_access_token ?? null
    }

    return await refreshToken(freshCreds ?? creds)
  } catch (err) {
    console.error("[Worker OAuth] Lock/refresh error:", err)
    // Return possibly-expired token as fallback
    return creds.oauth_access_token
  } finally {
    if (release) await release().catch(() => {})
  }
}

export function hasOAuthCredentials(): boolean {
  return readCredentials()?.oauth_access_token !== undefined
}
