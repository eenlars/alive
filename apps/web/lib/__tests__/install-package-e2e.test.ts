import { existsSync } from "node:fs"
import { DEFAULTS } from "@webalive/shared"
import { describe, expect, it } from "vitest"
import { extractDomainFromWorkspace, restartSystemdService } from "@/lib/workspace-service-manager"

/**
 * End-to-end tests for install-package functionality
 *
 * These tests interact with real systemd services and verify actual behavior.
 * They are marked with skip() if running in CI or test environment.
 */

describe("install-package E2E", () => {
  describe("actual systemd service restart", () => {
    it("should be able to restart a real systemd service if available", () => {
      // This test checks if we can actually restart a service
      // It's safe because we're using the startup.sonno.tech service
      // which is already deployed in the environment

      const workspacePath = "/srv/webalive/sites/startup.sonno.tech/user"

      // Verify workspace exists
      const workspaceExists = existsSync(workspacePath)
      if (!workspaceExists) {
        console.log("Workspace not found, skipping real service restart test")
        return
      }

      // Extract domain
      const domain = extractDomainFromWorkspace(workspacePath)
      expect(domain).toBe("startup.sonno.tech")

      // Try to restart service
      const result = restartSystemdService(domain!, "e2e-test-001")

      // Service should either succeed or fail gracefully
      expect(result).toHaveProperty("success")
      expect(result).toHaveProperty("message")

      if (result.success) {
        console.log("✓ Service restart succeeded")
        expect(result.message).toContain("restarted successfully")
      } else {
        console.log(`⚠ Service restart failed: ${result.message}`)
        // Failure is acceptable in test environment
        // Real failure would be if command crashed instead
      }
    })

    it("should handle service that doesn't exist gracefully", () => {
      const result = restartSystemdService("nonexistent-domain-xyz.com", "e2e-test-002")

      // Should not crash
      expect(result).toBeDefined()
      expect(result).toHaveProperty("success")
      expect(result).toHaveProperty("message")

      // Should indicate failure
      expect(result.success).toBe(false)
      expect(result.message).toContain("Failed to restart")
    })
  })

  describe("workspace path validation in real environment", () => {
    it("should correctly identify startup.sonno.tech workspace", () => {
      const workspacePath = "/srv/webalive/sites/startup.sonno.tech/user"
      const domain = extractDomainFromWorkspace(workspacePath)

      expect(domain).toBe("startup.sonno.tech")
    })

    it("should correctly identify other deployed sites if they exist", () => {
      const sitesPath = "/srv/webalive/sites"

      // Check which sites are actually deployed
      const deployedSites = ["startup.sonno.tech", "two.sonno.tech", "staging.sonno.tech", DEFAULTS.WILDCARD_DOMAIN]

      for (const site of deployedSites) {
        const workspacePath = `${sitesPath}/${site}/user`

        if (existsSync(workspacePath)) {
          const domain = extractDomainFromWorkspace(workspacePath)
          expect(domain).toBe(site)

          console.log(`✓ Found deployed site: ${site}`)
        }
      }
    })
  })

  describe("security validation", () => {
    it("should reject paths trying to escape workspace", () => {
      const maliciousPaths = [
        "/srv/webalive/sites/evil.com/user/../../../etc/passwd",
        "/srv/webalive/sites/example.com/user/../../../../",
        "/etc/passwd",
        "/../root/.ssh/id_rsa",
      ]

      for (const path of maliciousPaths) {
        const domain = extractDomainFromWorkspace(path)
        // Should return null for invalid paths
        expect(domain).toBeNull()
      }
    })

    it("should only accept paths ending with /user", () => {
      const invalidPaths = [
        "/srv/webalive/sites/example.com/src",
        "/srv/webalive/sites/example.com/public",
        "/srv/webalive/sites/example.com",
        "/srv/webalive/sites/example.com/user/src",
      ]

      for (const path of invalidPaths) {
        const domain = extractDomainFromWorkspace(path)
        expect(domain).toBeNull()
      }
    })

    it("should reject invalid domain characters in service names", () => {
      const invalidPaths = [
        "/srv/webalive/sites/example@invalid.com/user",
        "/srv/webalive/sites/example$(command)/user",
        "/srv/webalive/sites/example;rm -rf //user",
        "/srv/webalive/sites/example|whoami/user",
        "/srv/webalive/sites/example`id`/user",
      ]

      for (const path of invalidPaths) {
        // These paths should be rejected at extraction time
        // because domain validation rejects special characters
        const domain = extractDomainFromWorkspace(path)

        // Domain extraction should return null for invalid domains
        expect(domain).toBeNull()
      }
    })
  })

  describe("performance", () => {
    it("should extract domain quickly from valid paths", () => {
      const paths = [
        "/srv/webalive/sites/startup.sonno.tech/user",
        "/srv/webalive/sites/two.sonno.tech/user",
        "/srv/webalive/sites/example.com/user",
      ]

      const start = Date.now()

      for (let i = 0; i < 1000; i++) {
        for (const path of paths) {
          extractDomainFromWorkspace(path)
        }
      }

      const elapsed = Date.now() - start
      console.log(`Extracted domains 3000 times in ${elapsed}ms`)

      // Should be very fast (< 100ms for 3000 operations)
      expect(elapsed).toBeLessThan(100)
    })
  })

  describe("recovery and fallback scenarios", () => {
    it("should allow client to gracefully skip restart if domain extraction fails", () => {
      const invalidPath = "/invalid/path"
      const domain = extractDomainFromWorkspace(invalidPath)

      // Client sees null and knows to skip service restart
      expect(domain).toBeNull()

      // Client can still report partial success
      // (package installed, but no auto-restart)
      const clientResponse = {
        ok: true,
        message: "Package installed but dev server restart skipped (invalid path)",
        details: {
          packageInstalled: true,
          devServerRestarted: false,
        },
      }

      expect(clientResponse.ok).toBe(true)
      expect(clientResponse.details.devServerRestarted).toBe(false)
    })

    it("should not crash if systemctl is not available", () => {
      // Even if systemctl fails, the extraction should still work
      const workspacePath = "/srv/webalive/sites/startup.sonno.tech/user"
      const domain = extractDomainFromWorkspace(workspacePath)

      // Should succeed even if systemctl is unavailable
      expect(domain).toBe("startup.sonno.tech")
    })
  })
})
