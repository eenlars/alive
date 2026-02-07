import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"

const STREAM_ROUTE_PATH = new URL("../../../apps/web/app/api/claude/stream/route.ts", import.meta.url).pathname
const AUTOMATION_EXECUTOR_PATH = new URL("../../../apps/web/lib/automation/executor.ts", import.meta.url).pathname

function extractPoolQueryBlock(code: string): string {
  const start = code.indexOf("pool.query(credentials, {")
  expect(start).toBeGreaterThanOrEqual(0)

  const signalIndex = code.indexOf("signal:", start)
  expect(signalIndex).toBeGreaterThan(start)

  const end = code.indexOf("})", signalIndex)
  expect(end).toBeGreaterThan(signalIndex)

  return code.slice(start, end + 2)
}

describe("Owner key contract", () => {
  it("stream route passes ownerKey and workloadClass to pool.query", () => {
    const code = readFileSync(STREAM_ROUTE_PATH, "utf-8")
    const block = extractPoolQueryBlock(code)

    expect(block).toContain("ownerKey: user.id")
    expect(block).toContain('workloadClass: "chat"')
  })

  it("automation executor passes ownerKey and workloadClass to pool.query", () => {
    const code = readFileSync(AUTOMATION_EXECUTOR_PATH, "utf-8")
    const block = extractPoolQueryBlock(code)

    expect(block).toContain("ownerKey: params.userId")
    expect(block).toContain('workloadClass: "automation"')
  })
})
