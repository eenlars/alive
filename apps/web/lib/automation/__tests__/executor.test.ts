/**
 * Automation Executor Tests
 *
 * Verifies: input validation and strict worker-pool-only execution.
 * Mocks ../attempts to cut the deep dependency chain (worker pool, agent SDK, etc).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AttemptResult } from "../attempts"

interface MockUserQueryResult {
  data: { email: string | null; display_name: string | null } | null
  error: { message: string } | null
}

interface MockMembershipsQueryResult {
  data: Array<{ org_id: string | null; role: string | null }> | null
  error: { message: string } | null
}

// Mock the attempts module to isolate executor logic
const defaultAttempt: AttemptResult = {
  textMessages: ["Done"],
  allMessages: [{ role: "assistant", content: [{ type: "text", text: "Done" }] }],
  finalResponse: "Done",
}

const mockTryWorkerPool = vi.fn<() => Promise<AttemptResult>>(() => Promise.resolve(defaultAttempt))

const mockWorkerPoolState = { ENABLED: true }
const mockCreateSessionToken = vi.fn(() => Promise.resolve("session-token-123"))

let mockUserQueryResult: MockUserQueryResult
let mockMembershipsQueryResult: MockMembershipsQueryResult
const mockCreateServiceIamClient = vi.fn(() => ({
  from: (table: string) => {
    if (table === "users") {
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve(mockUserQueryResult),
          }),
        }),
      }
    }

    if (table === "org_memberships") {
      return {
        select: () => ({
          eq: () => Promise.resolve(mockMembershipsQueryResult),
        }),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  },
}))

vi.mock("../attempts", () => ({
  tryWorkerPool: mockTryWorkerPool,
  WORKER_POOL: mockWorkerPoolState,
}))

vi.mock("@webalive/shared", async importOriginal => {
  const actual = await importOriginal<typeof import("@webalive/shared")>()
  return {
    ...actual,
    SUPERADMIN: {
      ...actual.SUPERADMIN,
      EMAILS: ["admin@example.com"],
      WORKSPACE_NAME: "alive",
      WORKSPACE_PATH: "/root/webalive/alive",
    },
    getWorkspacePath: vi.fn((ws: string) =>
      ws === "alive" ? "/root/webalive/alive" : `/srv/webalive/sites/${ws}/user`,
    ),
  }
})

vi.mock("@webalive/tools", () => ({
  listGlobalSkills: vi.fn(() => Promise.resolve([])),
  getSkillById: vi.fn(() => null),
}))

vi.mock("@/features/chat/lib/systemPrompt", () => ({
  getSystemPrompt: vi.fn(() => "system prompt"),
}))

vi.mock("@/features/auth/lib/jwt", () => ({
  createSessionToken: mockCreateSessionToken,
}))

vi.mock("@/lib/anthropic-oauth", () => ({
  hasOAuthCredentials: vi.fn(() => true),
  getValidAccessToken: vi.fn(() => Promise.resolve({ accessToken: "test", refreshed: false })),
}))

vi.mock("@/lib/credits/supabase-credits", () => ({
  getOrgCredits: vi.fn(() => Promise.resolve(10)),
}))

vi.mock("@/lib/models/claude-models", () => ({
  DEFAULT_MODEL: "claude-sonnet-4-5",
}))

vi.mock("@/lib/utils", () => ({
  generateRequestId: vi.fn(() => "req-test-123"),
}))

vi.mock("@/lib/supabase/service", () => ({
  createServiceIamClient: mockCreateServiceIamClient,
}))

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
}))

describe("runAutomationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkerPoolState.ENABLED = true
    mockCreateSessionToken.mockResolvedValue("session-token-123")
    mockUserQueryResult = {
      data: { email: "user@example.com", display_name: "Test User" },
      error: null,
    }
    mockMembershipsQueryResult = {
      data: [{ org_id: "o1", role: "owner" }],
      error: null,
    }
  })

  it("rejects empty workspace", async () => {
    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "",
      prompt: "test",
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Workspace hostname is required")
  })

  it("rejects empty prompt", async () => {
    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "  ",
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("empty")
  })

  it("rejects invalid timeout", async () => {
    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test",
      timeoutSeconds: 0,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid timeout")
  })

  it("rejects timeout above 3600", async () => {
    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test",
      timeoutSeconds: 5000,
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Invalid timeout")
  })

  it("calls tryWorkerPool directly (no fallback)", async () => {
    const { runAutomationJob } = await import("../executor")

    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test prompt",
    })

    expect(mockTryWorkerPool).toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.response).toBe("Done")
  })

  it("returns failure when worker pool throws", async () => {
    mockTryWorkerPool.mockRejectedValueOnce(new Error("Worker crashed"))

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test prompt",
    })

    expect(result.success).toBe(false)
    expect(mockTryWorkerPool).toHaveBeenCalledTimes(1)
    expect(result.error).toContain("Worker crashed")
  })

  it("fails fast when worker pool is disabled", async () => {
    mockWorkerPoolState.ENABLED = false

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test prompt",
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("WORKER_POOL.ENABLED=true")
  })

  it("fails when responseToolName is set but tool was never called", async () => {
    mockTryWorkerPool.mockResolvedValueOnce({
      textMessages: ["I can't find the send_reply tool"],
      allMessages: [],
      finalResponse: "I can't find the send_reply tool",
      // toolResponseText is undefined — tool was never called
    })

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test",
      responseToolName: "send_reply",
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("send_reply")
    expect(result.error).toContain("never called")
  })

  it("extracts toolResponseText when responseToolName matches", async () => {
    mockTryWorkerPool.mockResolvedValueOnce({
      textMessages: ["Let me look around..."],
      allMessages: [],
      finalResponse: "",
      toolResponseText: "Hey Lars! The fans are humming steady tonight.",
    })

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test",
      responseToolName: "send_reply",
    })

    expect(result.success).toBe(true)
    expect(result.response).toBe("Hey Lars! The fans are humming steady tonight.")
  })

  it("passes minted session cookie to worker pool, scoped to job org, filtering invalid roles", async () => {
    mockMembershipsQueryResult = {
      data: [
        { org_id: "o1", role: "owner" },
        { org_id: "org-2", role: "viewer" },
      ],
      error: null,
    }

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test prompt",
    })

    expect(result.success).toBe(true)
    expect(mockCreateSessionToken).toHaveBeenCalledWith({
      userId: "u1",
      email: "user@example.com",
      name: "Test User",
      orgIds: ["o1"],
      orgRoles: { o1: "owner" },
    })
    expect(mockTryWorkerPool).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionCookie: "session-token-123",
      }),
    )
  })

  it("continues execution without session cookie when membership lookup fails", async () => {
    mockMembershipsQueryResult = {
      data: null,
      error: { message: "db down" },
    }

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test prompt",
    })

    expect(result.success).toBe(true)
    expect(mockCreateSessionToken).not.toHaveBeenCalled()
    expect(mockTryWorkerPool).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionCookie: undefined,
      }),
    )
  })

  it("skips credit check for alive workspace", async () => {
    mockUserQueryResult = {
      data: { email: "admin@example.com", display_name: "Admin User" },
      error: null,
    }

    // Mock getOrgCredits to return 0 — normally this would fail
    const { getOrgCredits } = await import("@/lib/credits/supabase-credits")
    vi.mocked(getOrgCredits).mockResolvedValueOnce(0)

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "alive",
      prompt: "test prompt",
    })

    // Should succeed even with 0 credits because alive workspace skips credit check
    expect(result.success).toBe(true)
    expect(vi.mocked(getOrgCredits)).not.toHaveBeenCalled()
    expect(mockTryWorkerPool).toHaveBeenCalledWith(
      expect.objectContaining({
        enableSuperadminTools: true,
      }),
    )
  })

  it("rejects alive workspace for non-superadmin users", async () => {
    mockUserQueryResult = {
      data: { email: "user@example.com", display_name: "Regular User" },
      error: null,
    }

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "alive",
      prompt: "test prompt",
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Only superadmins can run automations")
    expect(mockTryWorkerPool).not.toHaveBeenCalled()
  })

  it("still checks credits for normal workspaces", async () => {
    const { getOrgCredits } = await import("@/lib/credits/supabase-credits")
    vi.mocked(getOrgCredits).mockResolvedValueOnce(0)

    const { runAutomationJob } = await import("../executor")
    const result = await runAutomationJob({
      jobId: "j1",
      userId: "u1",
      orgId: "o1",
      workspace: "test.alive.best",
      prompt: "test prompt",
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain("Insufficient credits")
    expect(mockTryWorkerPool).not.toHaveBeenCalled()
  })
})
