/**
 * OAuth Token Management for the Worker
 *
 * Mirrors apps/web/lib/anthropic-oauth.ts exactly.
 * Reads from ~/.claude/.credentials.json (claudeAiOauth key).
 * Uses proper-lockfile to coordinate refresh with the web app.
 * Uses retryAsync for network resilience.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { retryAsync } from "@webalive/shared"
import lockfile from "proper-lockfile"
import { z } from "zod"

// Same constants as apps/web/lib/anthropic-oauth.ts
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"
const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000
const CLAUDE_CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json")

const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    factor: 2,
    minTimeout: 100,
    maxTimeout: 10_000,
    randomize: true,
  },
  stale: 30_000,
} as const

// Same types as apps/web/lib/anthropic-oauth.ts
interface ClaudeOAuthCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes?: string[]
  subscriptionType?: string
  rateLimitTier?: string
}

interface ClaudeCredentialsFile {
  claudeAiOauth?: ClaudeOAuthCredentials
}

const TokenRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
})
type TokenRefreshResponse = z.infer<typeof TokenRefreshResponseSchema>

function readClaudeCredentials(): ClaudeOAuthCredentials | null {
  try {
    if (!fs.existsSync(CLAUDE_CREDENTIALS_PATH)) return null
    const content = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, "utf-8")
    const data: ClaudeCredentialsFile = JSON.parse(content)
    if (!data.claudeAiOauth) return null
    const { accessToken, refreshToken, expiresAt } = data.claudeAiOauth
    if (!accessToken || !refreshToken || !expiresAt) return null
    return data.claudeAiOauth
  } catch (error) {
    console.error("[Worker OAuth] Failed to read credentials:", error)
    return null
  }
}

function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.message.includes("fetch failed") || error.message.includes("ECONNRESET")) return true
    const statusMatch = error.message.match(/\((\d{3})\)/)
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10)
      return status === 429 || status >= 500
    }
  }
  return false
}

async function refreshTokenInternal(refreshToken: string): Promise<ClaudeOAuthCredentials> {
  console.log("[Worker OAuth] Refreshing expired token...")

  return retryAsync(
    async () => {
      const response = await fetch(ANTHROPIC_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: ANTHROPIC_CLIENT_ID,
          refresh_token: refreshToken,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Anthropic token refresh failed (${response.status}): ${errorText}`)
      }

      const data = TokenRefreshResponseSchema.parse(await response.json())

      const newCredentials: ClaudeOAuthCredentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      }

      console.log("[Worker OAuth] Token refreshed, expires at:", new Date(newCredentials.expiresAt).toISOString())
      return newCredentials
    },
    {
      attempts: 3,
      minDelayMs: 500,
      maxDelayMs: 5000,
      jitter: 0.2,
      shouldRetry: isRetryableError,
      onRetry: ({ attempt, delayMs, err }) => {
        console.log(`[Worker OAuth] Retry ${attempt}/3 in ${delayMs}ms:`, err instanceof Error ? err.message : err)
      },
    },
  )
}

function saveCredentials(credentials: ClaudeOAuthCredentials): void {
  try {
    let existingData: ClaudeCredentialsFile = {}

    if (fs.existsSync(CLAUDE_CREDENTIALS_PATH)) {
      const content = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, "utf-8")
      existingData = JSON.parse(content)
    }

    existingData.claudeAiOauth = { ...existingData.claudeAiOauth, ...credentials }

    const dir = path.dirname(CLAUDE_CREDENTIALS_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    }

    fs.writeFileSync(CLAUDE_CREDENTIALS_PATH, JSON.stringify(existingData), { mode: 0o600 })
    console.log("[Worker OAuth] Saved refreshed credentials to disk")
  } catch (error) {
    console.error("[Worker OAuth] Failed to save credentials:", error)
  }
}

async function refreshTokenWithLock(): Promise<ClaudeOAuthCredentials | null> {
  if (!fs.existsSync(CLAUDE_CREDENTIALS_PATH)) return null

  let release: (() => Promise<void>) | undefined

  try {
    console.log("[Worker OAuth] Acquiring file lock...")
    release = await lockfile.lock(CLAUDE_CREDENTIALS_PATH, LOCK_OPTIONS)
    console.log("[Worker OAuth] Lock acquired")

    // Re-read after acquiring lock (another process may have refreshed)
    const credentials = readClaudeCredentials()
    if (!credentials) return null

    if (!isTokenExpired(credentials.expiresAt)) {
      console.log("[Worker OAuth] Token was refreshed by another process")
      return credentials
    }

    const newCredentials = await refreshTokenInternal(credentials.refreshToken)
    saveCredentials(newCredentials)
    return newCredentials
  } finally {
    if (release) {
      try {
        await release()
        console.log("[Worker OAuth] Lock released")
      } catch {
        // Ignore unlock errors
      }
    }
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 * Mirrors getValidAccessToken() from apps/web/lib/anthropic-oauth.ts.
 */
export async function getAccessToken(): Promise<string | null> {
  const credentials = readClaudeCredentials()
  if (!credentials) {
    console.error("[Worker OAuth] No credentials found")
    return null
  }

  if (!isTokenExpired(credentials.expiresAt)) {
    return credentials.accessToken
  }

  console.log("[Worker OAuth] Token expired, refreshing...")
  try {
    const refreshed = await refreshTokenWithLock()
    if (!refreshed) return null
    return refreshed.accessToken
  } catch (error) {
    console.error("[Worker OAuth] Token refresh failed:", error)
    throw error
  }
}

export function hasOAuthCredentials(): boolean {
  const credentials = readClaudeCredentials()
  return credentials !== null && !!credentials.refreshToken
}
