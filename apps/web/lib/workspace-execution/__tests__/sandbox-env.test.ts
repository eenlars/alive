import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createSandboxEnv } from "../sandbox-env"

/**
 * Tests for workspace sandbox environment.
 *
 * These tests verify that bridge secrets NEVER leak to workspace child processes.
 * If any of these fail, it's a critical security vulnerability.
 */

// Secrets that exist in the real Bridge process (from systemd env)
const BRIDGE_SECRETS = {
  SUPABASE_SERVICE_ROLE_KEY: "sbp_fake_service_role_key_12345",
  SUPABASE_URL: "https://fake.supabase.co",
  SUPABASE_ACCESS_TOKEN: "sbp_fake_access_token",
  SUPABASE_PROJECT_ID: "fake-project-id",
  JWT_SECRET: "fake-jwt-secret-that-signs-auth-tokens",
  LOCKBOX_MASTER_KEY: "fake-lockbox-key-that-decrypts-oauth-tokens",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  DATABASE_PASSWORD: "fake-db-password",
  REDIS_URL: "redis://localhost:6379",
  ANTH_API_SECRET: "sk-ant-fake-anthropic-key",
  STRIPE_OAUTH_TOKEN: "rk_live_fake_stripe_token",
  LINEAR_CLIENT_SECRET: "fake-linear-client-secret",
  GOOGLE_CLIENT_SECRET: "fake-google-client-secret",
  FLOWGLAD_SECRET_KEY: "fake-flowglad-key",
  GROQ_API_SECRET: "fake-groq-key",
  SHELL_PASSWORD: "fake-shell-password",
  INTERNAL_TOOLS_SECRET: "fake-internal-tools-secret",
  INTERNAL_WEBHOOK_SECRET: "fake-internal-webhook-secret",
  E2E_TEST_SECRET: "fake-e2e-secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://fake.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake",
  NEXT_PUBLIC_POSTHOG_KEY: "phc_fake_posthog_key",
  POSTHOG_PERSONAL_API_KEY: "phx_fake_personal_key",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake_anon",
} as const

// Env vars that SHOULD pass through (safe for workspace users)
const SAFE_VARS = {
  PATH: "/usr/local/bin:/usr/bin:/bin",
  NODE_ENV: "production",
  LANG: "en_US.UTF-8",
  PORT: "8998",
  BRIDGE_API_PORT: "8998",
  INTERNAL_TOOLS_SECRET: "fake-internal-tools-secret",
  BUN_INSTALL: "/root/.bun",
} as const

let savedEnv: NodeJS.ProcessEnv

beforeEach(() => {
  savedEnv = { ...process.env }
  // Simulate a real Bridge process environment
  Object.assign(process.env, BRIDGE_SECRETS, SAFE_VARS)
})

afterEach(() => {
  process.env = savedEnv
})

describe("createSandboxEnv", () => {
  describe("CRITICAL: Secret exclusion", () => {
    it("must NOT include any database credentials", () => {
      const env = createSandboxEnv()

      expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined()
      expect(env.SUPABASE_URL).toBeUndefined()
      expect(env.SUPABASE_ACCESS_TOKEN).toBeUndefined()
      expect(env.SUPABASE_PROJECT_ID).toBeUndefined()
      expect(env.DATABASE_URL).toBeUndefined()
      expect(env.DATABASE_PASSWORD).toBeUndefined()
    })

    it("must NOT include auth/encryption secrets", () => {
      const env = createSandboxEnv()

      expect(env.JWT_SECRET).toBeUndefined()
      expect(env.LOCKBOX_MASTER_KEY).toBeUndefined()
    })

    it("must NOT include third-party API secrets", () => {
      const env = createSandboxEnv()

      expect(env.ANTH_API_SECRET).toBeUndefined()
      expect(env.STRIPE_OAUTH_TOKEN).toBeUndefined()
      expect(env.LINEAR_CLIENT_SECRET).toBeUndefined()
      expect(env.GOOGLE_CLIENT_SECRET).toBeUndefined()
      expect(env.FLOWGLAD_SECRET_KEY).toBeUndefined()
      expect(env.GROQ_API_SECRET).toBeUndefined()
    })

    it("must NOT include infrastructure secrets", () => {
      const env = createSandboxEnv()

      expect(env.REDIS_URL).toBeUndefined()
      expect(env.SHELL_PASSWORD).toBeUndefined()
      expect(env.INTERNAL_WEBHOOK_SECRET).toBeUndefined()
      expect(env.E2E_TEST_SECRET).toBeUndefined()
    })

    it("must NOT include public keys that reveal infrastructure", () => {
      const env = createSandboxEnv()

      // These reveal our Supabase/PostHog projects — not secrets but not needed
      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined()
      expect(env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined()
      expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined()
      expect(env.POSTHOG_PERSONAL_API_KEY).toBeUndefined()
      expect(env.SUPABASE_ANON_KEY).toBeUndefined()
    })

    it("should have a small, bounded set of keys (allowlist is restrictive)", () => {
      const env = createSandboxEnv()
      const keys = Object.keys(env).filter(k => env[k] !== undefined)

      // The sandbox should have very few keys — if this grows past 15
      // someone is probably adding vars that should be denied
      expect(keys.length).toBeLessThan(15)
    })
  })

  describe("Safe vars that SHOULD pass through", () => {
    it("must include PATH for finding binaries", () => {
      const env = createSandboxEnv()
      expect(env.PATH).toBe(SAFE_VARS.PATH)
    })

    it("must include NODE_ENV", () => {
      const env = createSandboxEnv()
      expect(env.NODE_ENV).toBe("production")
    })

    it("must include PORT for MCP tool API callbacks", () => {
      const env = createSandboxEnv()
      expect(env.PORT).toBe("8998")
    })

    it("must include BRIDGE_API_PORT for API callbacks", () => {
      const env = createSandboxEnv()
      expect(env.BRIDGE_API_PORT).toBe("8998")
    })

    it("must include INTERNAL_TOOLS_SECRET for privileged tool callbacks", () => {
      const env = createSandboxEnv()
      expect(env.INTERNAL_TOOLS_SECRET).toBe("fake-internal-tools-secret")
    })

    it("must set TMPDIR/TMP/TEMP to /tmp", () => {
      const env = createSandboxEnv()
      expect(env.TMPDIR).toBe("/tmp")
      expect(env.TMP).toBe("/tmp")
      expect(env.TEMP).toBe("/tmp")
    })
  })

  describe("Unknown vars are excluded (allowlist behavior)", () => {
    it("must NOT pass through arbitrary env vars", () => {
      process.env.MY_CUSTOM_SECRET = "should-not-leak"
      process.env.SOME_TOKEN = "should-not-leak"
      process.env.AWS_SECRET_ACCESS_KEY = "should-not-leak"
      process.env.GH_TOKEN = "should-not-leak"

      const env = createSandboxEnv()

      expect(env.MY_CUSTOM_SECRET).toBeUndefined()
      expect(env.SOME_TOKEN).toBeUndefined()
      expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
      expect(env.GH_TOKEN).toBeUndefined()
    })
  })
})
