import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { sanitizeSubprocessEnv } from "../src/lib/env-sanitizer"

/**
 * Defense-in-depth tests for env-sanitizer.
 *
 * The PRIMARY security boundary is createSandboxEnv() in agent-child-runner.
 * This sanitizer is the SECONDARY layer — it strips known secrets in case
 * the outer boundary is misconfigured.
 */

const KNOWN_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_URL",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_ID",
  "DATABASE_URL",
  "DATABASE_PASSWORD",
  "JWT_SECRET",
  "LOCKBOX_MASTER_KEY",
  "REDIS_URL",
  "ANTHROPIC_API_KEY",
  "ANTH_API_SECRET",
  "STRIPE_OAUTH_TOKEN",
  "LINEAR_CLIENT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "FLOWGLAD_SECRET_KEY",
  "GROQ_API_SECRET",
  "SHELL_PASSWORD",
  "E2E_TEST_SECRET",
  "INTERNAL_WEBHOOK_SECRET",
] as const

let savedEnv: NodeJS.ProcessEnv

beforeEach(() => {
  savedEnv = { ...process.env }
  // Simulate what would happen if the outer sandbox fails and secrets leak in
  for (const key of KNOWN_SECRETS) {
    process.env[key] = `LEAKED_${key}`
  }
  process.env.PATH = "/usr/local/bin:/usr/bin:/bin"
  process.env.NODE_ENV = "production"
})

afterEach(() => {
  process.env = savedEnv
})

describe("sanitizeSubprocessEnv", () => {
  describe("Secret denylist (defense-in-depth)", () => {
    it("must strip ALL known bridge secrets", () => {
      const env = sanitizeSubprocessEnv()

      for (const key of KNOWN_SECRETS) {
        expect(env[key], `${key} must not be in sanitized env`).toBeUndefined()
      }
    })

    it("must keep safe system vars", () => {
      const env = sanitizeSubprocessEnv()

      expect(env.PATH).toBe("/usr/local/bin:/usr/bin:/bin")
      expect(env.NODE_ENV).toBe("production")
    })
  })

  describe("Cache directory cleanup", () => {
    it("must set TMPDIR/TMP/TEMP to /tmp", () => {
      const env = sanitizeSubprocessEnv()

      expect(env.TMPDIR).toBe("/tmp")
      expect(env.TMP).toBe("/tmp")
      expect(env.TEMP).toBe("/tmp")
    })

    it("must clear XDG directories (may point to /root)", () => {
      process.env.XDG_CACHE_HOME = "/root/.cache"
      process.env.XDG_CONFIG_HOME = "/root/.config"
      process.env.XDG_DATA_HOME = "/root/.local/share"
      process.env.XDG_STATE_HOME = "/root/.local/state"

      const env = sanitizeSubprocessEnv()

      expect(env.XDG_CACHE_HOME).toBeUndefined()
      expect(env.XDG_CONFIG_HOME).toBeUndefined()
      expect(env.XDG_DATA_HOME).toBeUndefined()
      expect(env.XDG_STATE_HOME).toBeUndefined()
    })

    it("must clear Bun install paths (may point to /root/.bun)", () => {
      process.env.BUN_INSTALL = "/root/.bun"
      process.env.BUN_INSTALL_CACHE_DIR = "/root/.bun/install/cache"
      process.env.BUN_INSTALL_BIN = "/root/.bun/bin"
      process.env.BUN_INSTALL_GLOBAL_DIR = "/root/.bun/install/global"

      const env = sanitizeSubprocessEnv()

      expect(env.BUN_INSTALL).toBeUndefined()
      expect(env.BUN_INSTALL_CACHE_DIR).toBeUndefined()
      expect(env.BUN_INSTALL_BIN).toBeUndefined()
      expect(env.BUN_INSTALL_GLOBAL_DIR).toBeUndefined()
    })

    it("must clear NPM/PNPM/Yarn cache paths", () => {
      process.env.NPM_CONFIG_CACHE = "/root/.npm"
      process.env.NPM_CONFIG_PREFIX = "/root/.npm-global"
      process.env.PNPM_HOME = "/root/.pnpm"
      process.env.YARN_CACHE_FOLDER = "/root/.yarn/cache"

      const env = sanitizeSubprocessEnv()

      expect(env.NPM_CONFIG_CACHE).toBeUndefined()
      expect(env.NPM_CONFIG_PREFIX).toBeUndefined()
      expect(env.PNPM_HOME).toBeUndefined()
      expect(env.YARN_CACHE_FOLDER).toBeUndefined()
    })
  })

  describe("Pass-through behavior", () => {
    it("should pass through vars not in the denylist", () => {
      process.env.SOME_SAFE_VAR = "hello"
      process.env.LANG = "en_US.UTF-8"

      const env = sanitizeSubprocessEnv()

      expect(env.SOME_SAFE_VAR).toBe("hello")
      expect(env.LANG).toBe("en_US.UTF-8")
    })
  })
})
