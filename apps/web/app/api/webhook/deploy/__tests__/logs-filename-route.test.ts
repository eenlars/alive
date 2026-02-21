import fs from "node:fs"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/features/auth/lib/auth", () => ({
  getSessionUser: vi.fn(),
}))

const { GET } = await import("../logs/[filename]/route")
const { getSessionUser } = await import("@/features/auth/lib/auth")

const LOG_DIR = path.join(process.cwd(), "../../logs")
const createdFiles: string[] = []

function makeUser(isSuperadmin: boolean) {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "User",
    canSelectAnyModel: false,
    isAdmin: isSuperadmin,
    isSuperadmin,
    enabledModels: [],
  }
}

async function callGet(filename: string) {
  return GET(new Request(`http://localhost/api/webhook/deploy/logs/${filename}`) as never, {
    params: Promise.resolve({ filename }),
  })
}

describe("GET /api/webhook/deploy/logs/[filename]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fs.mkdirSync(LOG_DIR, { recursive: true })
  })

  afterEach(() => {
    for (const filePath of createdFiles.splice(0)) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }
  })

  it("returns 401 for unauthenticated users", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)

    const res = await callGet("deploy-2026-02-21T20-00-00-123Z.log")
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.error).toBe("NO_SESSION")
  })

  it("returns 403 for non-superadmin users", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser(false))

    const res = await callGet("deploy-2026-02-21T20-00-00-123Z.log")
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.error).toBe("FORBIDDEN")
  })

  it("rejects invalid log filenames", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser(true))

    const res = await callGet("../secrets.log")
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toBe("INVALID_REQUEST")
  })

  it("reads a valid deployment log filename with Z suffix", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(makeUser(true))

    const filename = "deploy-2026-02-21T20-13-19-307Z.log"
    const logPath = path.join(LOG_DIR, filename)
    createdFiles.push(logPath)
    fs.writeFileSync(logPath, "deployment ok\n")

    const res = await callGet(filename)
    const content = await res.text()

    expect(res.status).toBe(200)
    expect(content).toContain("deployment ok")
    expect(res.headers.get("content-type")).toContain("text/plain")
  })
})
