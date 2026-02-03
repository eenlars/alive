import { describe, expect, it } from "vitest"
import type { Workspace } from "@/features/workspace/lib/workspace-secure"
import { ALLOWED_SDK_TOOLS, createToolPermissionHandler } from "@/lib/claude/tool-permissions"

describe("Tool Permission System", () => {
  const mockWorkspace: Workspace = {
    root: "/srv/webalive/sites/example.com/user",
    uid: 1000,
    gid: 1000,
    tenantId: "example.com",
  }

  const requestId = "test-request-123"
  const mockOptions = { signal: new AbortController().signal, toolUseID: "test-tool-id-123" }

  describe("ALLOWED_SDK_TOOLS whitelist", () => {
    it("should only include safe file operation tools", () => {
      const allowedArray = Array.from(ALLOWED_SDK_TOOLS)

      // Must include these safe tools
      expect(allowedArray).toContain("Read")
      expect(allowedArray).toContain("Write")
      expect(allowedArray).toContain("Edit")
      expect(allowedArray).toContain("Glob")
      expect(allowedArray).toContain("Grep")
    })

    it("should NOT include dangerous tools", () => {
      const allowedArray = Array.from(ALLOWED_SDK_TOOLS)

      // Must NOT include dangerous operations
      const dangerousTools = ["Bash", "Exec", "Command", "Shell", "Delete", "Remove", "Rm", "WebSearch"]

      for (const dangerous of dangerousTools) {
        expect(allowedArray).not.toContain(dangerous)
      }
    })

    it("should have a reasonable number of tools (not too permissive)", () => {
      // Should be a small, controlled set of tools
      expect(ALLOWED_SDK_TOOLS.size).toBeLessThanOrEqual(10)
    })
  })

  describe("createToolPermissionHandler", () => {
    it("should allow whitelisted tools", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const readResult = await canUseTool("Read", { file_path: `${mockWorkspace.root}/test.txt` }, mockOptions)
      expect(readResult.behavior).toBe("allow")

      const writeResult = await canUseTool("Write", { file_path: `${mockWorkspace.root}/test.txt` }, mockOptions)
      expect(writeResult.behavior).toBe("allow")
    })

    it("should deny non-whitelisted tools", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const bashResult = await canUseTool("Bash", { command: "ls -la" }, mockOptions)
      expect(bashResult.behavior).toBe("deny")
      if (bashResult.behavior === "deny") {
        expect(bashResult.message).toContain("tool_not_allowed")
      }
    })

    it("should preserve input without modifications", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const input = { file_path: `${mockWorkspace.root}/test.txt` }
      const result = await canUseTool("Read", input, mockOptions)

      expect(result.behavior).toBe("allow")
      if (result.behavior === "allow") {
        expect(result.updatedInput).toEqual(input)
      }
    })

    it("should validate file paths are within workspace", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      // Valid path inside workspace
      const validResult = await canUseTool(
        "Read",
        {
          file_path: `${mockWorkspace.root}/valid-file.txt`,
        },
        mockOptions,
      )
      expect(validResult.behavior).toBe("allow")

      // Path traversal attack
      const attackResult = await canUseTool(
        "Read",
        {
          file_path: `${mockWorkspace.root}/../../../etc/passwd`,
        },
        mockOptions,
      )
      expect(attackResult.behavior).toBe("deny")
      if (attackResult.behavior === "deny") {
        expect(attackResult.message).toContain("path_outside_workspace")
      }
    })

    it("should check multiple path parameter names", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      // Test file_path
      const filePathResult = await canUseTool(
        "Read",
        {
          file_path: "/etc/passwd",
        },
        mockOptions,
      )
      expect(filePathResult.behavior).toBe("deny")

      // Test path
      const pathResult = await canUseTool(
        "Glob",
        {
          path: "/etc/passwd",
        },
        mockOptions,
      )
      expect(pathResult.behavior).toBe("deny")
    })

    it("should allow tools without file paths", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      // Some tools might not have file paths (e.g., search queries)
      const result = await canUseTool("Grep", { pattern: "search-term" }, mockOptions)
      expect(result.behavior).toBe("allow")
    })

    it("should handle absolute paths outside workspace", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const attacks = ["/etc/passwd", "/root/.ssh/id_rsa", "/srv/webalive/sites/other-site/secret.txt"]

      for (const attack of attacks) {
        const result = await canUseTool("Read", { file_path: attack }, mockOptions)
        expect(result.behavior, `Should deny: ${attack}`).toBe("deny")
        if (result.behavior === "deny") {
          expect(result.message).toContain("path_outside_workspace")
        }
      }
    })

    it("should handle relative path traversal", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const attacks = [`${mockWorkspace.root}/../../../etc/passwd`, `${mockWorkspace.root}/../../root/.bashrc`]

      for (const attack of attacks) {
        const result = await canUseTool("Read", { file_path: attack }, mockOptions)
        expect(result.behavior, `Should deny: ${attack}`).toBe("deny")
      }
    })

    it("should preserve tool input parameters", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const input = {
        file_path: `${mockWorkspace.root}/test.txt`,
        content: "test content",
        encoding: "utf-8",
      }

      const result = await canUseTool("Write", input, mockOptions)

      expect(result.behavior).toBe("allow")
      if (result.behavior === "allow") {
        expect(result.updatedInput).toMatchObject({
          file_path: input.file_path,
          content: input.content,
          encoding: input.encoding,
        })
      }
    })
  })

  describe("Security Edge Cases", () => {
    it("should deny empty tool names", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const result = await canUseTool("", { file_path: `${mockWorkspace.root}/test.txt` }, mockOptions)
      expect(result.behavior).toBe("deny")
    })

    it("should deny tools with similar names", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      // These look similar but should be denied
      const similarTools = ["read", "READ", "Read ", " Read", "Reads"]

      for (const tool of similarTools) {
        if (tool === "Read") continue // Skip the actual allowed tool

        const result = await canUseTool(tool, { file_path: `${mockWorkspace.root}/test.txt` }, mockOptions)
        expect(result.behavior, `Should deny: "${tool}"`).toBe("deny")
      }
    })

    it("should handle empty input objects", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const result = await canUseTool("Read", {}, mockOptions)
      expect(["allow", "deny"]).toContain(result.behavior)
    })

    it("should handle workspace at root directory", async () => {
      const rootWorkspace: Workspace = {
        root: "/srv/webalive",
        uid: 1000,
        gid: 1000,
        tenantId: "test",
      }

      const canUseTool = createToolPermissionHandler(rootWorkspace, requestId)

      // Should allow within workspace
      const validResult = await canUseTool("Read", { file_path: "/srv/webalive/test.txt" }, mockOptions)
      expect(validResult.behavior).toBe("allow")

      // Should deny outside
      const invalidResult = await canUseTool("Read", { file_path: "/etc/passwd" }, mockOptions)
      expect(invalidResult.behavior).toBe("deny")
    })
  })

  describe("Real-World Attack Scenarios", () => {
    it("should block reading sensitive system files", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const sensitiveFiles = ["/etc/passwd", "/etc/shadow", "/root/.ssh/id_rsa", "/root/.bashrc", "/proc/self/environ"]

      for (const file of sensitiveFiles) {
        const result = await canUseTool("Read", { file_path: file }, mockOptions)
        expect(result.behavior, `Should block: ${file}`).toBe("deny")
      }
    })

    it("should block reading other workspace secrets", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const attacks = ["/srv/webalive/sites/other-site/user/.env", "/srv/webalive/sites/competitor/user/config.json"]

      for (const attack of attacks) {
        const result = await canUseTool("Read", { file_path: attack }, mockOptions)
        expect(result.behavior, `Should block: ${attack}`).toBe("deny")
      }
    })

    it("should block reading claude-bridge configuration", async () => {
      const canUseTool = createToolPermissionHandler(mockWorkspace, requestId)

      const attacks = [
        "/root/webalive/claude-bridge/.env",
        "/var/lib/claude-bridge/domain-passwords.json",
        "/root/webalive/claude-bridge/apps/web/.env.local",
      ]

      for (const attack of attacks) {
        const result = await canUseTool("Read", { file_path: attack }, mockOptions)
        expect(result.behavior, `Should block: ${attack}`).toBe("deny")
      }
    })
  })
})
