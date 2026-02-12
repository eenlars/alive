/**
 * authStore unit tests
 *
 * Tests Zustand store directly without React rendering to avoid
 * React version mismatch issues in monorepo workspace.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock PostHogProvider to avoid React/JSX dependency in node environment
vi.mock("@/components/providers/PostHogProvider", () => ({
  resetPostHogIdentity: vi.fn(),
}))

import { authStore } from "../authStore"

// Access the store's internal state and actions directly
const getState = () => authStore.getState()
const getActions = () => authStore.getState().actions

describe("authStore", () => {
  // Track location changes via global mock
  let locationHref = ""

  beforeEach(() => {
    // Reset store before each test
    getActions().reset()
    locationHref = ""

    // Mock window.location for redirect tests
    if (typeof globalThis !== "undefined") {
      // Create a mock that tracks href changes
      const mockLocation = {
        get href() {
          return locationHref
        },
        set href(value: string) {
          locationHref = value
        },
        ancestorOrigins: {} as DOMStringList,
        hash: "",
        host: "localhost",
        hostname: "localhost",
        origin: "http://localhost",
        pathname: "/",
        port: "",
        protocol: "http:",
        search: "",
        assign: vi.fn(),
        reload: vi.fn(),
        replace: vi.fn(),
        toString: () => locationHref,
      } as unknown as Location

      // @ts-expect-error - mocking window for tests
      globalThis.window = {
        location: mockLocation,
      }
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("initial state", () => {
    it("should start with unknown status", () => {
      const state = getState()
      expect(state.status).toBe("unknown")
    })

    it("should not be session expired initially", () => {
      const state = getState()
      expect(state.status === "session_expired").toBe(false)
    })

    it("should have no expired reason initially", () => {
      const state = getState()
      expect(state.expiredReason).toBeNull()
    })
  })

  describe("setAuthenticated", () => {
    it("should set status to authenticated", () => {
      getActions().setAuthenticated()

      const state = getState()
      expect(state.status).toBe("authenticated")
    })

    it("should clear expired state when authenticated", () => {
      // First expire
      getActions().handleSessionExpired("Test reason")
      expect(getState().status).toBe("session_expired")

      // Then authenticate
      getActions().setAuthenticated()
      expect(getState().status).toBe("authenticated")
      expect(getState().sessionExpiredAt).toBeNull()
      expect(getState().expiredReason).toBeNull()
    })
  })

  describe("handleSessionExpired", () => {
    it("should set status to session_expired", () => {
      getActions().handleSessionExpired()

      expect(getState().status).toBe("session_expired")
    })

    it("should set isSessionExpired to true", () => {
      getActions().handleSessionExpired()

      expect(getState().status === "session_expired").toBe(true)
    })

    it("should store the expiry reason", () => {
      getActions().handleSessionExpired("Custom expiry reason")

      expect(getState().expiredReason).toBe("Custom expiry reason")
    })

    it("should use default reason when none provided", () => {
      getActions().handleSessionExpired()

      expect(getState().expiredReason).toBe("Your session has expired. Please log in again.")
    })

    it("should record expiry timestamp", () => {
      const before = Date.now()
      getActions().handleSessionExpired()
      const after = Date.now()

      const timestamp = getState().sessionExpiredAt
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })

    it("should not reset timestamp on repeated calls (idempotent)", () => {
      getActions().handleSessionExpired("First call")
      const firstTimestamp = getState().sessionExpiredAt

      // Second call - timestamp should remain the same
      getActions().handleSessionExpired("Second call")

      expect(getState().sessionExpiredAt).toBe(firstTimestamp)
      // Reason should also remain unchanged (idempotent)
      expect(getState().expiredReason).toBe("First call")
    })
  })

  describe("redirectToLogin", () => {
    it("should redirect to login page", () => {
      getActions().redirectToLogin()

      expect(locationHref).toBe("/?reason=session_expired")
    })

    it("should clear session expired state", () => {
      // First expire
      getActions().handleSessionExpired()
      expect(getState().status).toBe("session_expired")

      // Then redirect
      getActions().redirectToLogin()
      expect(getState().status).toBe("unauthenticated")
    })

    it("should clear expiry reason and timestamp", () => {
      getActions().handleSessionExpired("Test reason")
      expect(getState().expiredReason).toBe("Test reason")
      expect(getState().sessionExpiredAt).not.toBeNull()

      getActions().redirectToLogin()

      expect(getState().expiredReason).toBeNull()
      expect(getState().sessionExpiredAt).toBeNull()
    })
  })

  describe("reset", () => {
    it("should reset to initial state", () => {
      // Change state first
      getActions().handleSessionExpired("Test reason")
      expect(getState().status).toBe("session_expired")

      // Then reset
      getActions().reset()

      expect(getState().status).toBe("unknown")
      expect(getState().sessionExpiredAt).toBeNull()
      expect(getState().expiredReason).toBeNull()
    })
  })

  describe("authStore direct access (for non-React contexts)", () => {
    it("should expose handleSessionExpired", () => {
      authStore.handleSessionExpired("Direct access test")

      const state = authStore.getState()
      expect(state.status).toBe("session_expired")
      expect(state.expiredReason).toBe("Direct access test")
    })

    it("should expose setAuthenticated", () => {
      authStore.setAuthenticated()

      const state = authStore.getState()
      expect(state.status).toBe("authenticated")
    })
  })
})
