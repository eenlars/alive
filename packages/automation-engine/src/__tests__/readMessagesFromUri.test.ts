import { beforeEach, describe, expect, it, vi } from "vitest"

const readFileMock = vi.fn()
const realpathMock = vi.fn()

vi.mock("node:fs/promises", () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    rm: vi.fn(),
    readFile: readFileMock,
    realpath: realpathMock,
  },
}))

vi.mock("@webalive/shared", () => ({
  getServerId: vi.fn(() => "srv_test"),
}))

vi.mock("@webalive/automation", () => ({
  computeNextRunAtMs: vi.fn(() => Date.now() + 60_000),
}))

describe("readMessagesFromUri", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("reads messages from allowed file path", async () => {
    const { readMessagesFromUri } = await import("../engine")
    const basePath = "/var/log/automation-runs/messages"
    const filePath = "/var/log/automation-runs/messages/run_123.json"

    realpathMock.mockResolvedValueOnce(basePath).mockResolvedValueOnce(filePath)
    readFileMock.mockResolvedValueOnce('[{"role":"assistant","content":"ok"}]')

    const result = await readMessagesFromUri(`file://${filePath}`)

    expect(result).toEqual([{ role: "assistant", content: "ok" }])
  })

  it("blocks traversal paths outside messages directory", async () => {
    const { readMessagesFromUri } = await import("../engine")
    const traversalPath = "file:///var/log/automation-runs/messages/../../etc/passwd.json"

    const result = await readMessagesFromUri(traversalPath)

    expect(result).toBeNull()
    expect(realpathMock).not.toHaveBeenCalled()
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it("blocks symlink escapes when realpath resolves outside messages directory", async () => {
    const { readMessagesFromUri } = await import("../engine")
    const basePath = "/var/log/automation-runs/messages"
    const filePath = "/var/log/automation-runs/messages/run_456.json"

    realpathMock.mockResolvedValueOnce(basePath).mockResolvedValueOnce("/etc/shadow.json")

    const result = await readMessagesFromUri(`file://${filePath}`)

    expect(result).toBeNull()
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it("returns null when JSON payload is not an array", async () => {
    const { readMessagesFromUri } = await import("../engine")
    const basePath = "/var/log/automation-runs/messages"
    const filePath = "/var/log/automation-runs/messages/run_789.json"

    realpathMock.mockResolvedValueOnce(basePath).mockResolvedValueOnce(filePath)
    readFileMock.mockResolvedValueOnce('{"ok":true}')

    const result = await readMessagesFromUri(`file://${filePath}`)

    expect(result).toBeNull()
  })
})
