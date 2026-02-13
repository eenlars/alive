/**
 * Automation Executor Tests
 *
 * Verifies: input validation and strict worker-pool-only execution.
 * Mocks ../attempts to cut the deep dependency chain (worker pool, agent SDK, etc).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the attempts module to isolate executor logic
const mockTryWorkerPool = vi.fn(() =>
  Promise.resolve({
    textMessages: ["Done"],
    allMessages: [{ role: "assistant", content: [{ type: "text", text: "Done" }] }],
    finalResponse: "Done",
  }),
)

const mockWorkerPoolState = { ENABLED: true }

vi.mock("../attempts", () => ({
  tryWorkerPool: mockTryWorkerPool,
  WORKER_POOL: mockWorkerPoolState,
}))

vi.mock("@webalive/shared", async importOriginal => {
  const actual = await importOriginal<typeof import("@webalive/shared")>()
  return {
    ...actual,
    getWorkspacePath: vi.fn((ws: string) => `/srv/webalive/sites/${ws}/user`),
  }
})

vi.mock("@webalive/tools", () => ({
  listGlobalSkills: vi.fn(() => Promise.resolve([])),
  getSkillById: vi.fn(() => null),
}))

vi.mock("@/features/chat/lib/systemPrompt", () => ({
  getSystemPrompt: vi.fn(() => "system prompt"),
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

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
}))

describe("runAutomationJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkerPoolState.ENABLED = true
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
})
