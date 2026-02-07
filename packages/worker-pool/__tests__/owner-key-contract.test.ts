import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const STREAM_ROUTE_PATH = new URL("../../../apps/web/app/api/claude/stream/route.ts", import.meta.url).pathname
const AUTOMATION_EXECUTOR_PATH = new URL("../../../apps/web/lib/automation/executor.ts", import.meta.url).pathname

describe("Owner key contract", () => {
  it("stream route passes ownerKey and workloadClass to pool.query", () => {
    const code = readFileSync(STREAM_ROUTE_PATH, "utf-8")
    const poolCall = code.match(/pool\.query\(credentials,\s*\{[\s\S]*?\}\)/m)
    expect(poolCall).not.toBeNull()
    const block = poolCall![0]

    expect(block).toContain("ownerKey: user.id")
    expect(block).toContain('workloadClass: "chat"')
  })

  it("automation executor passes ownerKey and workloadClass to pool.query", () => {
    const code = readFileSync(AUTOMATION_EXECUTOR_PATH, "utf-8")
    const poolCall = code.match(/pool\.query\(credentials,\s*\{[\s\S]*?\}\)/m)
    expect(poolCall).not.toBeNull()
    const block = poolCall![0]

    expect(block).toContain("ownerKey: params.userId")
    expect(block).toContain('workloadClass: "automation"')
  })
})
