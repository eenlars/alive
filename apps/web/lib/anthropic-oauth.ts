/**
 * Anthropic OAuth Token Refresh
 *
 * Automatically refreshes expired OAuth tokens for Claude Pro/Max subscriptions.
 * Based on OpenClaw's implementation from @mariozechner/pi-ai.
 *
 * Uses proper-lockfile for file-based locking to prevent race conditions
 * when multiple processes try to refresh the same token simultaneously.
 */

import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { retryAsync } from "@webalive/shared"
import lockfile from "proper-lockfile"

// Anthropic OAuth constants (same as Claude Code / OpenClaw)
const ANTHROPIC_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"
const ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

// Refresh 5 minutes before actual expiry to prevent edge cases
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000

// Path to Claude Code credentials
const CLAUDE_CREDENTIALS_PATH = path.join(os.homedir(), ".claude", ".credentials.json")

// Lock options matching OpenClaw's configuration
const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    factor: 2,
    minTimeout: 100,
    maxTimeout: 10_000,
    randomize: true,
  },
  stale: 30_000, // Consider lock stale after 30 seconds
} as const

export interface ClaudeOAuthCredentials {
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

interface TokenRefreshResponse {
  access_token: string
  refresh_token: string
  expires_in: number
}

/**
 * Read Claude OAuth credentials from ~/.claude/.credentials.json
 */
export function readClaudeCredentials(): ClaudeOAuthCredentials | null {
  try {
    if (!fs.existsSync(CLAUDE_CREDENTIALS_PATH)) {
      return null
    }

    const content = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, "utf-8")
    const data: ClaudeCredentialsFile = JSON.parse(content)

    if (!data.claudeAiOauth) {
      return null
    }

    const { accessToken, refreshToken, expiresAt } = data.claudeAiOauth

    if (!accessToken || !refreshToken || !expiresAt) {
      return null
    }

    return data.claudeAiOauth
  } catch (error) {
    console.error("[anthropic-oauth] Failed to read credentials:", error)
    return null
  }
}

/**
 * Check if token is expired (with buffer)
 */
export function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt - TOKEN_EXPIRY_BUFFER_MS
}

/**
 * Check if an error is retryable (network errors, 5xx, rate limits)
 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes("fetch failed") || error.message.includes("ECONNRESET")) {
      return true
    }
    // Rate limiting or server errors
    if (error.message.includes("429") || error.message.includes("5")) {
      const statusMatch = error.message.match(/\((\d{3})\)/)
      if (statusMatch) {
        const status = parseInt(statusMatch[1], 10)
        return status === 429 || status >= 500
      }
    }
  }
  return false
}

/**
 * Refresh an expired Anthropic OAuth token with retry logic
 */
async function refreshTokenInternal(refreshToken: string): Promise<ClaudeOAuthCredentials> {
  console.log("[anthropic-oauth] Refreshing expired token...")

  return retryAsync(
    async () => {
      const response = await fetch(ANTHROPIC_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

      const data: TokenRefreshResponse = await response.json()

      const newCredentials: ClaudeOAuthCredentials = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
      }

      console.log("[anthropic-oauth] Token refreshed, expires at:", new Date(newCredentials.expiresAt).toISOString())

      return newCredentials
    },
    {
      attempts: 3,
      minDelayMs: 500,
      maxDelayMs: 5000,
      jitter: 0.2,
      shouldRetry: isRetryableError,
      onRetry: ({ attempt, delayMs, err }) => {
        console.log(`[anthropic-oauth] Retry ${attempt}/3 in ${delayMs}ms:`, err instanceof Error ? err.message : err)
      },
    },
  )
}

/**
 * Save refreshed credentials back to ~/.claude/.credentials.json
 */
function saveCredentials(credentials: ClaudeOAuthCredentials): void {
  try {
    let existingData: ClaudeCredentialsFile = {}

    if (fs.existsSync(CLAUDE_CREDENTIALS_PATH)) {
      const content = fs.readFileSync(CLAUDE_CREDENTIALS_PATH, "utf-8")
      existingData = JSON.parse(content)
    }

    existingData.claudeAiOauth = {
      ...existingData.claudeAiOauth,
      ...credentials,
    }

    // Ensure directory exists
    const dir = path.dirname(CLAUDE_CREDENTIALS_PATH)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
    }

    // Write with secure permissions
    fs.writeFileSync(CLAUDE_CREDENTIALS_PATH, JSON.stringify(existingData), { mode: 0o600 })

    console.log("[anthropic-oauth] Saved refreshed credentials to disk")
  } catch (error) {
    console.error("[anthropic-oauth] Failed to save credentials:", error)
    // Don't throw - the refresh succeeded, just saving failed
  }
}

/**
 * Refresh token with file-based locking.
 * Prevents race conditions when multiple processes try to refresh simultaneously.
 */
async function refreshTokenWithLock(): Promise<ClaudeOAuthCredentials | null> {
  // Ensure credentials file exists before locking
  if (!fs.existsSync(CLAUDE_CREDENTIALS_PATH)) {
    return null
  }

  let release: (() => Promise<void>) | undefined

  try {
    console.log("[anthropic-oauth] Acquiring file lock...")
    release = await lockfile.lock(CLAUDE_CREDENTIALS_PATH, LOCK_OPTIONS)
    console.log("[anthropic-oauth] Lock acquired")

    // Re-read credentials after acquiring lock (another process may have refreshed)
    const credentials = readClaudeCredentials()
    if (!credentials) {
      return null
    }

    // Check again if token is still expired (another process may have refreshed while we waited)
    if (!isTokenExpired(credentials.expiresAt)) {
      console.log("[anthropic-oauth] Token was refreshed by another process")
      return credentials
    }

    // Perform the actual refresh
    const newCredentials = await refreshTokenInternal(credentials.refreshToken)
    saveCredentials(newCredentials)
    return newCredentials
  } finally {
    if (release) {
      try {
        await release()
        console.log("[anthropic-oauth] Lock released")
      } catch {
        // Ignore unlock errors (lock may have been released already)
      }
    }
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 * Uses file-based locking (proper-lockfile) to prevent race conditions
 * when multiple processes try to refresh the same token simultaneously.
 */
export async function getValidAccessToken(): Promise<{
  accessToken: string
  refreshed: boolean
} | null> {
  const credentials = readClaudeCredentials()

  if (!credentials) {
    return null
  }

  // Token still valid - no refresh needed
  if (!isTokenExpired(credentials.expiresAt)) {
    return {
      accessToken: credentials.accessToken,
      refreshed: false,
    }
  }

  // Token expired - refresh with file lock
  console.log("[anthropic-oauth] Token expired, refreshing...")

  try {
    const refreshed = await refreshTokenWithLock()
    if (!refreshed) {
      return null
    }
    return {
      accessToken: refreshed.accessToken,
      refreshed: true,
    }
  } catch (error) {
    console.error("[anthropic-oauth] Token refresh failed:", error)
    throw error
  }
}

/**
 * Check if OAuth credentials are available and valid (or can be refreshed)
 */
export function hasOAuthCredentials(): boolean {
  const credentials = readClaudeCredentials()
  return credentials !== null && !!credentials.refreshToken
}

/**
 * Get access token WITHOUT refreshing. Returns null if expired.
 * Use this in production to avoid competing with CLI for token refresh.
 * If token is expired, user should run /login in CLI.
 */
export function getAccessTokenReadOnly(): {
  accessToken: string
  expiresAt: number
  isExpired: boolean
} | null {
  const credentials = readClaudeCredentials()
  if (!credentials) {
    return null
  }

  return {
    accessToken: credentials.accessToken,
    expiresAt: credentials.expiresAt,
    isExpired: isTokenExpired(credentials.expiresAt),
  }
}
