/**
 * Session Cookie Integration Tests
 *
 * These tests verify that session cookies flow correctly through the ACTUAL
 * production code paths, not mocks.
 *
 * THE BUG: MCP tools like restart_dev_server call Bridge API, which requires
 * authentication via ALIVE_SESSION_COOKIE. Without it, tools fail silently.
 *
 * TEST STRATEGY:
 * 1. Type-safe: Uses TypeScript interfaces from types.ts
 * 2. Static analysis: Verify route.ts includes sessionCookie in payload
 * 3. Static analysis: Verify worker-entry.mjs sets ALIVE_SESSION_COOKIE
 * 4. Contract: Verify payload shape between route.ts and worker-entry.mjs
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { prepareRequestEnv } from "../src/env-isolation"
import type { AgentConfig, AgentRequest } from "../src/types"
import { ENV_VARS } from "../src/types"

// Paths to actual production code
const ROUTE_PATH = join(__dirname, "../../../apps/web/app/api/claude/stream/route.ts")
const WORKER_ENTRY_PATH = join(__dirname, "../src/worker-entry.mjs")
const ENV_ISOLATION_PATH = join(__dirname, "../src/env-isolation.ts")
const API_CLIENT_PATH = join(__dirname, "../../tools/src/lib/api-client.ts")

// Extract field names from types for validation
type AgentRequestFields = keyof AgentRequest
type AgentConfigFields = keyof AgentConfig

// Fields that MUST be in AgentRequest (excluding optional fields that may not appear in code)
const REQUIRED_PAYLOAD_FIELDS: AgentRequestFields[] = ["message", "agentConfig", "sessionCookie"]

// Fields that MUST be in AgentConfig
const REQUIRED_AGENT_CONFIG_FIELDS: AgentConfigFields[] = [
  "allowedTools",
  "disallowedTools",
  "permissionMode",
  "settingSources",
  "oauthMcpServers",
  "streamTypes",
]

describe("Session Cookie: Static Analysis of Production Code", () => {
  /**
   * CRITICAL: Verify route.ts passes sessionCookie to worker pool payload.
   *
   * This catches the exact bug: route.ts was missing sessionCookie in the
   * worker pool path while the legacy path had it.
   */
  it("route.ts MUST include sessionCookie in worker pool payload", () => {
    const routeCode = readFileSync(ROUTE_PATH, "utf-8")

    // Find the worker pool section
    const workerPoolSection = routeCode.includes("WORKER_POOL.ENABLED")
    expect(workerPoolSection).toBe(true)

    // Find the payload object passed to pool.query
    // Must contain sessionCookie
    const payloadMatch = routeCode.match(/payload:\s*\{[\s\S]*?sessionCookie[\s\S]*?\}/m)
    expect(payloadMatch).not.toBeNull()

    // Verify it's in the worker pool path, not just legacy
    const workerPoolPayloadRegex = /pool\.query\([\s\S]*?payload:\s*\{[\s\S]*?sessionCookie/
    expect(workerPoolPayloadRegex.test(routeCode)).toBe(true)
  })

  /**
   * CRITICAL: Verify route.ts gets sessionCookie BEFORE the worker pool section.
   *
   * The sessionCookie must be obtained early so it's available for both paths.
   */
  it("route.ts MUST get sessionCookie before branching to worker pool", () => {
    const routeCode = readFileSync(ROUTE_PATH, "utf-8")

    // Find where sessionCookie is defined
    const sessionCookieDefIndex = routeCode.indexOf("const sessionCookie = await getSafeSessionCookie")
    expect(sessionCookieDefIndex).toBeGreaterThan(-1)

    // Find where WORKER_POOL.ENABLED check happens
    const workerPoolCheckIndex = routeCode.indexOf("if (WORKER_POOL.ENABLED)")
    expect(workerPoolCheckIndex).toBeGreaterThan(-1)

    // sessionCookie must be defined BEFORE the branch
    expect(sessionCookieDefIndex).toBeLessThan(workerPoolCheckIndex)
  })

  /**
   * CRITICAL: Verify worker-entry delegates env handling to prepareRequestEnv.
   *
   * Without this call, MCP tools lose auth and env leakage protections can regress.
   */
  it("worker-entry.mjs MUST call prepareRequestEnv(payload)", () => {
    const workerCode = readFileSync(WORKER_ENTRY_PATH, "utf-8")

    expect(workerCode).toContain("prepareRequestEnv(payload)")
  })

  /**
   * Verify env preparation happens BEFORE the query execution.
   *
   * If env prep runs after query(), MCP tools won't have auth/correct secrets.
   */
  it("worker-entry.mjs MUST call prepareRequestEnv before query() call", () => {
    const workerCode = readFileSync(WORKER_ENTRY_PATH, "utf-8")

    // Find where env isolation is applied
    const envPrepIndex = workerCode.indexOf("prepareRequestEnv(payload)")
    expect(envPrepIndex).toBeGreaterThan(-1)

    // Find where query() is called
    const queryCallIndex = workerCode.indexOf("const agentQuery = query({")
    expect(queryCallIndex).toBeGreaterThan(-1)

    // Env must be prepared BEFORE query is called
    expect(envPrepIndex).toBeLessThan(queryCallIndex)
  })

  /**
   * Verify api-client.ts uses ALIVE_SESSION_COOKIE for authentication.
   *
   * This is what MCP tools use to call back to Bridge API.
   */
  it(`api-client.ts MUST use ${ENV_VARS.ALIVE_SESSION_COOKIE} for API auth`, () => {
    const clientCode = readFileSync(API_CLIENT_PATH, "utf-8")

    // Must read from process.env.ALIVE_SESSION_COOKIE
    expect(clientCode).toContain(`process.env.${ENV_VARS.ALIVE_SESSION_COOKIE}`)

    // Must include it in Cookie header
    expect(clientCode).toContain("Cookie:")
    expect(clientCode).toContain("sessionCookie")
  })
})

describe("Session Cookie: Payload Contract", () => {
  /**
   * Extract and verify the payload structure passed to worker pool.
   *
   * This ensures route.ts and worker-entry.mjs agree on the contract.
   * Uses TypeScript types to ensure field names are correct.
   */
  it("route.ts payload MUST include required AgentRequest fields", () => {
    const routeCode = readFileSync(ROUTE_PATH, "utf-8")

    // Verify route.ts includes each required field in payload
    for (const field of REQUIRED_PAYLOAD_FIELDS) {
      // Check field is mentioned in the payload section
      const payloadRegex = new RegExp(`payload:\\s*\\{[\\s\\S]*?${field}[\\s\\S]*?\\}`, "m")
      const hasField = payloadRegex.test(routeCode)
      expect(hasField, `route.ts payload should include '${field}'`).toBe(true)
    }
  })

  /**
   * Verify worker-entry.mjs reads critical fields from payload.
   * Fields may be accessed via destructuring or direct access.
   */
  it("worker-entry.mjs MUST read critical payload fields", () => {
    const workerCode = readFileSync(WORKER_ENTRY_PATH, "utf-8")

    // agentConfig is destructured: const { agentConfig } = payload
    const agentConfigField: AgentRequestFields = "agentConfig"
    const hasDestructure =
      workerCode.includes(`{ ${agentConfigField} } = payload`) ||
      workerCode.match(new RegExp(`\\{[^}]*${agentConfigField}[^}]*\\}\\s*=\\s*payload`))
    const hasDirect = workerCode.includes(`payload.${agentConfigField}`)
    expect(hasDestructure || hasDirect, `worker-entry.mjs should read '${agentConfigField}' from payload`).toBe(true)

    // sessionCookie is accessed directly: payload.sessionCookie
    const sessionCookieField: AgentRequestFields = "sessionCookie"
    expect(
      workerCode.includes(`payload.${sessionCookieField}`),
      `worker-entry.mjs should read 'payload.${sessionCookieField}'`,
    ).toBe(true)

    // message is accessed directly: payload.message
    const messageField: AgentRequestFields = "message"
    expect(
      workerCode.includes(`payload.${messageField}`),
      `worker-entry.mjs should read 'payload.${messageField}'`,
    ).toBe(true)
  })

  /**
   * Verify agentConfig structure is consistent.
   * Uses AgentConfig type to ensure field names are correct.
   */
  it("agentConfig structure matches AgentConfig type", () => {
    const routeCode = readFileSync(ROUTE_PATH, "utf-8")
    const workerCode = readFileSync(WORKER_ENTRY_PATH, "utf-8")

    // Route.ts must set these fields in agentConfig
    for (const field of REQUIRED_AGENT_CONFIG_FIELDS) {
      expect(routeCode.includes(field), `route.ts should set agentConfig.${field}`).toBe(true)
    }

    // Worker must destructure/use these fields
    for (const field of REQUIRED_AGENT_CONFIG_FIELDS) {
      expect(workerCode.includes(field), `worker-entry.mjs should use agentConfig.${field}`).toBe(true)
    }
  })
})

describe("Session Cookie: Legacy vs Worker Pool Parity", () => {
  /**
   * CRITICAL: Both code paths must pass sessionCookie.
   *
   * The bug was that worker pool path was missing sessionCookie while
   * legacy path had it. This test ensures parity.
   */
  it("both legacy and worker pool paths pass sessionCookie", () => {
    const routeCode = readFileSync(ROUTE_PATH, "utf-8")

    // Find worker pool query payload section (more robust than full if/else block matching)
    const workerPoolMatch = routeCode.match(
      /pool\.query\(credentials,\s*\{[\s\S]*?payload:\s*\{[\s\S]*?\}\s*,\s*onMessage:/m,
    )
    expect(workerPoolMatch).not.toBeNull()
    const workerPoolSection = workerPoolMatch![0]

    // Find legacy section
    const legacyMatch = routeCode.match(/\} else \{[\s\S]*?runAgentChild[\s\S]*?\}/m)
    expect(legacyMatch).not.toBeNull()
    const legacySection = legacyMatch![0]

    // Both must include sessionCookie
    expect(workerPoolSection.includes("sessionCookie"), "Worker pool path must include sessionCookie").toBe(true)

    expect(legacySection.includes("sessionCookie"), "Legacy path must include sessionCookie").toBe(true)
  })
})

describe("Session Cookie: Security Considerations", () => {
  /**
   * Session cookie should only be set from trusted payload, not user input.
   */
  it("worker-entry.mjs should not log session cookie", () => {
    const workerCode = readFileSync(WORKER_ENTRY_PATH, "utf-8")

    // Should not log the cookie value
    expect(workerCode).not.toMatch(/console\.(log|error).*sessionCookie/)
    expect(workerCode).not.toMatch(new RegExp(`console\\.(log|error).*${ENV_VARS.ALIVE_SESSION_COOKIE}`))
  })

  /**
   * Verify cookie is always cleared/set at start of each request.
   * This prevents cookie leakage between requests from different users.
   */
  it("env-isolation.ts should always set/clear env var to prevent leakage", () => {
    const envIsolationCode = readFileSync(ENV_ISOLATION_PATH, "utf-8")

    // Should always set ALIVE_SESSION_COOKIE (with fallback to empty string)
    // Pattern: process.env.ALIVE_SESSION_COOKIE = payload.sessionCookie || ""
    expect(envIsolationCode).toMatch(/process\.env\.ALIVE_SESSION_COOKIE\s*=\s*payload\.sessionCookie\s*\|\|\s*["']/)
  })

  it("worker-entry.mjs delegates env isolation to prepareRequestEnv", () => {
    const workerCode = readFileSync(WORKER_ENTRY_PATH, "utf-8")

    // Worker must call the shared function rather than inline the logic.
    expect(workerCode).toContain("prepareRequestEnv(payload)")
  })
})

describe("Session Cookie: Error Scenarios", () => {
  /**
   * Verify api-client handles missing cookie gracefully.
   */
  it("api-client.ts should handle missing session cookie", () => {
    const clientCode = readFileSync(API_CLIENT_PATH, "utf-8")

    // Should have conditional for sessionCookie
    expect(clientCode).toMatch(/sessionCookie\s*&&/)
  })

  /**
   * Verify PORT env var is validated (required for API base URL).
   */
  it("api-client.ts should validate PORT env var", () => {
    const clientCode = readFileSync(API_CLIENT_PATH, "utf-8")

    // Should check PORT exists
    expect(clientCode).toContain("process.env.PORT")

    // Should throw on invalid PORT
    expect(clientCode).toMatch(/throw.*PORT/)
  })
})

describe("Query Cancellation: Complete Result", () => {
  /**
   * Verify worker-entry.mjs includes cancelled flag in complete result.
   * This was a bug fix - mocks expected { cancelled: true } but production didn't set it.
   */
  it("worker-entry.mjs MUST include cancelled flag in complete result", () => {
    const workerCode = readFileSync(WORKER_ENTRY_PATH, "utf-8")

    // Must check signal.aborted to determine cancellation
    expect(workerCode).toContain("signal.aborted")

    // Must include cancelled field in result
    expect(workerCode).toMatch(/cancelled:\s*wasCancelled/)

    // Must set wasCancelled from signal.aborted
    expect(workerCode).toMatch(/wasCancelled\s*=\s*signal\.aborted/)
  })

  /**
   * Verify CompleteResult type includes cancelled field.
   */
  it("types.ts CompleteResult MUST include cancelled field", () => {
    const typesPath = join(__dirname, "../src/types.ts")
    const typesCode = readFileSync(typesPath, "utf-8")

    // CompleteResult interface must exist
    expect(typesCode).toContain("interface CompleteResult")

    // Must include cancelled field
    expect(typesCode).toMatch(/cancelled:\s*boolean/)
  })
})

describe("Environment Isolation: Behavioral Tests", () => {
  let savedEnv: Record<string, string | undefined>

  beforeEach(() => {
    // Snapshot env keys we'll touch so we can restore after each test
    savedEnv = {
      ALIVE_SESSION_COOKIE: process.env.ALIVE_SESSION_COOKIE,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    }
    // Also snapshot any existing USER_* keys
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("USER_")) {
        savedEnv[key] = process.env[key]
      }
    }
  })

  afterEach(() => {
    // Restore original env
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    // Clean up any USER_* keys created during test
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("USER_") && !(key in savedEnv)) {
        delete process.env[key]
      }
    }
  })

  it("sets ALIVE_SESSION_COOKIE from payload", () => {
    prepareRequestEnv({ sessionCookie: "cookie-abc" })
    expect(process.env.ALIVE_SESSION_COOKIE).toBe("cookie-abc")
  })

  it("clears ALIVE_SESSION_COOKIE when payload has none", () => {
    process.env.ALIVE_SESSION_COOKIE = "stale-cookie"
    prepareRequestEnv({})
    expect(process.env.ALIVE_SESSION_COOKIE).toBe("")
  })

  it("deletes ANTHROPIC_API_KEY when request supplies no apiKey", () => {
    process.env.ANTHROPIC_API_KEY = "leaked-key-from-previous-request"
    prepareRequestEnv({ sessionCookie: "x" })
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it("sets ANTHROPIC_API_KEY when request supplies apiKey", () => {
    prepareRequestEnv({ apiKey: "user-key-123" })
    expect(process.env.ANTHROPIC_API_KEY).toBe("user-key-123")
  })

  it("clears stale USER_* env keys from a previous request", () => {
    process.env.USER_OLD_SECRET = "should-be-cleared"
    process.env.USER_ANOTHER = "also-stale"
    prepareRequestEnv({ userEnvKeys: { FRESH: "new-value" } })
    expect(process.env.USER_OLD_SECRET).toBeUndefined()
    expect(process.env.USER_ANOTHER).toBeUndefined()
    expect(process.env.USER_FRESH).toBe("new-value")
  })

  it("clears USER_* keys even when payload has no new keys", () => {
    process.env.USER_LEFTOVER = "stale"
    prepareRequestEnv({})
    expect(process.env.USER_LEFTOVER).toBeUndefined()
  })

  it("rejects invalid USER_* key names", () => {
    prepareRequestEnv({ userEnvKeys: { valid_KEY: "ok", lower: "bad", "HAS SPACE": "bad" } })
    // Only keys that don't match /^[A-Z][A-Z0-9_]*$/ are rejected
    expect(process.env.USER_lower).toBeUndefined()
    expect(process.env["USER_HAS SPACE"]).toBeUndefined()
  })

  it("returns correct apiKeySource and userEnvKeyCount", () => {
    const result1 = prepareRequestEnv({ apiKey: "k" })
    expect(result1.apiKeySource).toBe("user")

    const result2 = prepareRequestEnv({ userEnvKeys: { A: "1", B: "2" } })
    expect(result2.apiKeySource).toBe("oauth")
    expect(result2.userEnvKeyCount).toBe(2)
  })
})
