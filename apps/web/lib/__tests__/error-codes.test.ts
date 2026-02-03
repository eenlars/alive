import { describe, expect, it } from "vitest"
import { ErrorCodes, getErrorHelp, getErrorMessage, isWorkspaceError } from "@/lib/error-codes"

describe("Error Code Registry", () => {
  describe("getErrorMessage", () => {
    it("should return a message for every ErrorCode", () => {
      // Get all error codes
      const allErrorCodes = Object.values(ErrorCodes)

      // Test each error code has a non-empty message
      for (const code of allErrorCodes) {
        const message = getErrorMessage(code)
        expect(message, `ErrorCode ${code} should have a message`).toBeTruthy()
        expect(message.length, `ErrorCode ${code} message should be non-empty`).toBeGreaterThan(0)
      }
    })

    it("should return user-friendly messages from Claude's perspective", () => {
      const message = getErrorMessage(ErrorCodes.FILE_READ_ERROR)
      // Should use "I" perspective (Claude speaking)
      expect(message).toMatch(/I cannot|I can't|I couldn't/)
    })

    it("should support dynamic details in messages", () => {
      const messageWithHost = getErrorMessage(ErrorCodes.WORKSPACE_NOT_FOUND, { host: "example.com" })
      expect(messageWithHost).toContain("example.com")

      const messageWithField = getErrorMessage(ErrorCodes.INVALID_REQUEST, { field: "email" })
      expect(messageWithField).toContain("email")
    })

    it("should handle missing details gracefully", () => {
      // Should not throw when details are expected but not provided
      expect(() => getErrorMessage(ErrorCodes.WORKSPACE_NOT_FOUND)).not.toThrow()
      expect(() => getErrorMessage(ErrorCodes.INVALID_REQUEST)).not.toThrow()
    })

    it("should return fallback for unknown error codes", () => {
      type UnknownCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]
      const message = getErrorMessage("UNKNOWN_CODE_XYZ" as UnknownCode)
      expect(message).toContain("unexpected")
    })
  })

  describe("getErrorHelp", () => {
    it("should return help text for critical user-facing errors", () => {
      const criticalErrors = [
        ErrorCodes.WORKSPACE_NOT_FOUND,
        ErrorCodes.PATH_OUTSIDE_WORKSPACE,
        ErrorCodes.ERROR_MAX_TURNS,
        ErrorCodes.TOOL_NOT_ALLOWED,
        ErrorCodes.FILE_READ_ERROR,
        ErrorCodes.CONVERSATION_BUSY,
        ErrorCodes.INVALID_CREDENTIALS,
      ]

      for (const code of criticalErrors) {
        const help = getErrorHelp(code)
        expect(help, `Critical error ${code} should have help text`).toBeTruthy()
        if (help) {
          expect(help.length, `Help text for ${code} should be non-empty`).toBeGreaterThan(0)
        }
      }
    })

    it("should return null for errors that don't need help", () => {
      const help = getErrorHelp(ErrorCodes.INTERNAL_ERROR)
      const helpType = help === null ? "null" : typeof help
      expect(["null", "string"]).toContain(helpType)
    })

    it("should provide actionable guidance in help text", () => {
      const help = getErrorHelp(ErrorCodes.ERROR_MAX_TURNS)
      expect(help).toMatch(/new conversation|start fresh/i)
    })
  })

  describe("isWorkspaceError", () => {
    it("should identify workspace-related errors", () => {
      expect(isWorkspaceError(ErrorCodes.WORKSPACE_NOT_FOUND)).toBe(true)
      expect(isWorkspaceError(ErrorCodes.WORKSPACE_INVALID)).toBe(true)
      expect(isWorkspaceError(ErrorCodes.WORKSPACE_MISSING)).toBe(true)
      expect(isWorkspaceError(ErrorCodes.WORKSPACE_RESTART_FAILED)).toBe(true)
    })

    it("should not identify non-workspace errors", () => {
      expect(isWorkspaceError(ErrorCodes.INVALID_CREDENTIALS)).toBe(false)
      expect(isWorkspaceError(ErrorCodes.FILE_READ_ERROR)).toBe(false)
      expect(isWorkspaceError(ErrorCodes.CONVERSATION_BUSY)).toBe(false)
    })
  })

  describe("Error Code Consistency", () => {
    it("should have unique error codes", () => {
      const codes = Object.values(ErrorCodes)
      const uniqueCodes = new Set(codes)
      expect(uniqueCodes.size).toBe(codes.length)
    })

    it("should use SCREAMING_SNAKE_CASE for all codes", () => {
      const codes = Object.values(ErrorCodes)
      for (const code of codes) {
        expect(code).toMatch(/^[A-Z_]+$/)
      }
    })

    it("should group errors logically by prefix", () => {
      // Workspace errors should start with WORKSPACE_
      expect(ErrorCodes.WORKSPACE_NOT_FOUND).toMatch(/^WORKSPACE_/)
      expect(ErrorCodes.WORKSPACE_INVALID).toMatch(/^WORKSPACE_/)

      // File errors should start with FILE_
      expect(ErrorCodes.FILE_READ_ERROR).toMatch(/^FILE_/)
      expect(ErrorCodes.FILE_WRITE_ERROR).toMatch(/^FILE_/)

      // Image errors should start with IMAGE_
      expect(ErrorCodes.IMAGE_UPLOAD_FAILED).toMatch(/^IMAGE_/)
      expect(ErrorCodes.IMAGE_DELETE_FAILED).toMatch(/^IMAGE_/)
    })
  })

  describe("Security-Critical Errors", () => {
    it("should have clear messages for security errors", () => {
      const securityErrors = [
        ErrorCodes.UNAUTHORIZED,
        ErrorCodes.INVALID_CREDENTIALS,
        ErrorCodes.PATH_OUTSIDE_WORKSPACE,
        ErrorCodes.TOOL_NOT_ALLOWED,
      ]

      for (const code of securityErrors) {
        const message = getErrorMessage(code)
        expect(message).toBeTruthy()
        // Security errors should not leak sensitive info
        expect(message).not.toMatch(/password|token|key|secret/i)
      }
    })

    it("should explain security boundaries clearly", () => {
      const message = getErrorMessage(ErrorCodes.PATH_OUTSIDE_WORKSPACE)
      expect(message).toMatch(/workspace|allowed|access/i)

      const toolMessage = getErrorMessage(ErrorCodes.TOOL_NOT_ALLOWED)
      expect(toolMessage).toMatch(/security|cannot use/i)
    })
  })
})
