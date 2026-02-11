import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Tests for resilient systemd service restart.
 *
 * We mock `child_process.execSync` to simulate various systemd states
 * without touching real services.
 */

// Mock execSync before importing the module under test
const mockExecSync = vi.fn()
vi.mock("node:child_process", () => ({
  execSync: (...args: unknown[]) => mockExecSync(...args),
}))

// Import after mocking
const { restartSystemdService } = await import("../systemd-restart")

describe("restartSystemdService", () => {
  beforeEach(() => {
    mockExecSync.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("validation", () => {
    it("rejects invalid service names", () => {
      expect(() => restartSystemdService("$(rm -rf /)")).toThrow("Invalid service name")
      expect(() => restartSystemdService("foo;bar")).toThrow("Invalid service name")
      expect(() => restartSystemdService("foo bar")).toThrow("Invalid service name")
    })

    it("accepts valid service names", () => {
      // Should not throw for valid names — will fail on execSync mock instead
      mockExecSync.mockReturnValue("")
      const result = restartSystemdService("site@example-com.service")
      expect(result.success).toBe(true)
    })
  })

  describe("happy path", () => {
    it("restarts successfully on first attempt", () => {
      // systemctl restart succeeds, is-active succeeds
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.startsWith("systemctl restart")) return ""
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-active")) return ""
        if (typeof cmd === "string" && cmd.startsWith("sleep")) return ""
        return ""
      })

      const result = restartSystemdService("site@test.service")
      expect(result).toEqual({
        success: true,
        action: "restarted",
        serviceActive: true,
      })
    })

    it("fails if service doesn't become active in time", () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.startsWith("systemctl restart")) return ""
        // is-active always fails (service slow to start)
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-active")) {
          throw new Error("inactive")
        }
        // not failed state
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-failed")) {
          throw new Error("not failed")
        }
        if (typeof cmd === "string" && cmd.startsWith("journalctl")) {
          return "service never became active"
        }
        if (typeof cmd === "string" && cmd.startsWith("sleep")) return ""
        return ""
      })

      const result = restartSystemdService("site@test.service", { waitForActive: 100 })
      expect(result.success).toBe(false)
      expect(result.action).toBe("failed")
      expect(result.serviceActive).toBe(false)
      expect(result.error).toContain("did not become active")
      expect(result.diagnostics).toContain("never became active")
    })
  })

  describe("reset-failed recovery", () => {
    it("recovers from failed state via reset-failed", () => {
      let restartAttempt = 0

      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.startsWith("systemctl restart")) {
          restartAttempt++
          if (restartAttempt === 1) throw new Error("Unit is not active")
          return "" // Second attempt succeeds
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-failed")) {
          return "failed" // Unit is in failed state
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl reset-failed")) {
          return "" // Reset succeeds
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-active")) {
          return "" // Active after second restart
        }
        if (typeof cmd === "string" && cmd.startsWith("sleep")) return ""
        return ""
      })

      const result = restartSystemdService("site@test.service")
      expect(result).toEqual({
        success: true,
        action: "reset-then-restarted",
        serviceActive: true,
      })
    })

    it("recovers when restart command succeeds but service never becomes active", () => {
      let restartAttempt = 0

      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.startsWith("systemctl restart")) {
          restartAttempt++
          return ""
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-active")) {
          // First restart never becomes active; second restart does
          if (restartAttempt === 1) throw new Error("inactive")
          return ""
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-failed")) {
          return "failed"
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl reset-failed")) {
          return ""
        }
        if (typeof cmd === "string" && cmd.startsWith("sleep")) return ""
        return ""
      })

      const result = restartSystemdService("site@test.service", { waitForActive: 100 })
      expect(result).toEqual({
        success: true,
        action: "reset-then-restarted",
        serviceActive: true,
      })
    })
  })

  describe("total failure", () => {
    it("returns diagnostics when both attempts fail", () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.startsWith("systemctl restart")) {
          throw new Error("Unit entered failed state")
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-failed")) {
          return "failed"
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl reset-failed")) {
          return ""
        }
        if (typeof cmd === "string" && cmd.startsWith("journalctl")) {
          return "Feb 11 16:00:00 server bun[1234]: Error: out of memory"
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-active")) {
          throw new Error("inactive")
        }
        return ""
      })

      const result = restartSystemdService("site@test.service")
      expect(result.success).toBe(false)
      expect(result.action).toBe("failed")
      expect(result.serviceActive).toBe(false)
      expect(result.error).toContain("restart failed after reset-failed")
      expect(result.diagnostics).toContain("out of memory")
    })

    it("returns failure when not in failed state and restart fails", () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.startsWith("systemctl restart")) {
          throw new Error("timeout")
        }
        // is-failed throws (exit code 1 = not failed)
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-failed")) {
          throw new Error("not failed")
        }
        if (typeof cmd === "string" && cmd.startsWith("journalctl")) {
          return "some journal output"
        }
        return ""
      })

      const result = restartSystemdService("site@test.service")
      expect(result.success).toBe(false)
      expect(result.action).toBe("failed")
      expect(result.error).toContain("not in failed state")
      expect(result.diagnostics).toBe("some journal output")
    })

    it("handles reset-failed itself failing", () => {
      mockExecSync.mockImplementation((cmd: string) => {
        if (typeof cmd === "string" && cmd.startsWith("systemctl restart")) {
          throw new Error("Unit failed")
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl is-failed")) {
          return "failed"
        }
        if (typeof cmd === "string" && cmd.startsWith("systemctl reset-failed")) {
          throw new Error("permission denied")
        }
        if (typeof cmd === "string" && cmd.startsWith("journalctl")) {
          return "journal logs here"
        }
        return ""
      })

      const result = restartSystemdService("site@test.service")
      expect(result.success).toBe(false)
      expect(result.action).toBe("failed")
      expect(result.error).toContain("reset-failed failed")
      expect(result.error).toContain("permission denied")
    })
  })

  describe("options", () => {
    it("passes custom timeout to execSync", () => {
      mockExecSync.mockReturnValue("")

      restartSystemdService("site@test.service", { timeout: 30_000 })

      const restartCall = mockExecSync.mock.calls.find(
        (call: unknown[]) => typeof call[0] === "string" && call[0].startsWith("systemctl restart"),
      )
      expect(restartCall).toBeDefined()
      expect(restartCall?.[1]).toMatchObject({ timeout: 30_000 })
    })
  })
})
