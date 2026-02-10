import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const TEST_FILE_DIR = dirname(fileURLToPath(import.meta.url))

function resolveRepoFile(...segments: string[]): string {
  const candidateRoots = [resolve(TEST_FILE_DIR, "../../.."), process.cwd(), resolve(process.cwd(), "../..")]

  for (const root of candidateRoots) {
    const candidate = join(root, ...segments)
    if (existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Unable to resolve repo file: ${segments.join("/")}`)
}

const STREAM_ROUTE_PATH = resolveRepoFile("apps", "web", "app", "api", "claude", "stream", "route.ts")
const AUTOMATION_EXECUTOR_PATH = resolveRepoFile("apps", "web", "lib", "automation", "executor.ts")

function extractPoolQueryBlock(code: string): string {
  const queryCallMatch = /pool\.query\(\s*[^,]+,\s*\{/.exec(code)
  expect(queryCallMatch).not.toBeNull()
  if (!queryCallMatch) {
    throw new Error("pool.query call not found")
  }

  const objectStart = queryCallMatch.index + queryCallMatch[0].length - 1
  let depth = 0

  for (let i = objectStart; i < code.length; i++) {
    const char = code[i]
    if (char === "{") {
      depth += 1
      continue
    }
    if (char !== "}") continue

    depth -= 1
    if (depth !== 0) continue

    let j = i + 1
    while (j < code.length && /\s/.test(code[j])) {
      j += 1
    }
    expect(code[j]).toBe(")")
    return code.slice(queryCallMatch.index, j + 1)
  }

  throw new Error("pool.query options object was not balanced")
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
