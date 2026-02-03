import { describe, expect, it, vi, beforeEach } from "vitest"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { GetWorkflowParams, WorkflowCategory } from "../src/tools/meta/get-workflow.js"
import { TOOL_REGISTRY } from "../src/tools/meta/tool-registry.js"

// Create a hoisted mock for fs/promises
const { readFileMock } = vi.hoisted(() => ({
  readFileMock: vi.fn(),
}))

// Mock fs/promises with actual implementation by default
vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    readFile: readFileMock,
  }
})

// Import after mocking
import * as fsPromises from "node:fs/promises"
import { getWorkflow } from "../src/tools/meta/get-workflow.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const workflowsPath = join(__dirname, "../workflows")

const FILE_MAP: Record<WorkflowCategory, string> = {
  "bug-debugging": "01-bug-debugging-request.md",
  "new-feature": "02-new-feature-request.md",
  "package-installation": "03-package-installation.md",
  "website-shippable-check": "04-website-shippable-check.md",
  "functionality-check": "05-functionality-check.md",
}

// Keep reference to actual readFile for tests that need real file reads
const actualReadFile = vi.importActual<typeof import("node:fs/promises")>("node:fs/promises").then(m => m.readFile)

describe("getWorkflow", () => {
  beforeEach(async () => {
    // Reset mock and use actual implementation by default
    readFileMock.mockReset()
    const realReadFile = await actualReadFile
    readFileMock.mockImplementation(realReadFile)
  })

  it("returns full content for bug-debugging workflow", async () => {
    const params: GetWorkflowParams = { workflow_type: "bug-debugging" }
    const result = await getWorkflow(params)

    expect(result.isError).toBe(false)
    expect(result.content).toHaveLength(1)
    const text = result.content[0].text

    // Basic header and key sections
    expect(text).toContain("# Tool Workflow: Bug Report / Debugging Request")
    expect(text).toContain("## Decision Tree")
    expect(text).toContain("### Path 1: TypeScript/Compilation Error")
    expect(text).toContain("## Critical Rules")

    // Ensure no legacy progressive disclosure artifacts
    expect(text).not.toContain("Usage Examples")
    expect(text).not.toContain("detail_level")

    // It should equal the exact file contents (no modifications)
    const expected = await fsPromises.readFile(join(workflowsPath, FILE_MAP["bug-debugging"]), "utf-8")
    expect(text).toBe(expected)
  })

  it("returns full content for new-feature workflow", async () => {
    const params: GetWorkflowParams = { workflow_type: "new-feature" }
    const result = await getWorkflow(params)

    expect(result.isError).toBe(false)
    const text = result.content[0].text

    expect(text).toContain("# Tool Workflow: New Feature Request")
    expect(text).toContain("## Decision Tree")
    expect(text).toContain("### Example 1: Simple Frontend Feature (No Dependencies)")
    expect(text).toContain("## Critical Rules")

    expect(text).not.toContain("Usage Examples")
    expect(text).not.toContain("detail_level")

    const expected = await fsPromises.readFile(join(workflowsPath, FILE_MAP["new-feature"]), "utf-8")
    expect(text).toBe(expected)
  })

  it("returns full content for package-installation workflow", async () => {
    const params: GetWorkflowParams = { workflow_type: "package-installation" }
    const result = await getWorkflow(params)

    expect(result.isError).toBe(false)
    const text = result.content[0].text

    expect(text).toContain("# Tool Workflow: Package Installation")
    expect(text).toContain("## Decision Tree")
    expect(text).toContain("### Path 1: Simple Package Installation")
    expect(text).toContain("## Critical Rules")

    expect(text).not.toContain("Usage Examples")
    expect(text).not.toContain("detail_level")

    const expected = await fsPromises.readFile(join(workflowsPath, FILE_MAP["package-installation"]), "utf-8")
    expect(text).toBe(expected)
  })

  it("handles invalid workflow type gracefully", async () => {
    // @ts-expect-error runtime validation should handle unexpected input
    const result = await getWorkflow({ workflow_type: "invalid-type" })

    expect(result.isError).toBe(false)
    const text = result.content[0].text

    expect(text).toContain("# Workflow Not Found")
    expect(text).toContain("Available workflows:")
    expect(text).toContain("- bug-debugging")
    expect(text).toContain("- new-feature")
    expect(text).toContain("- package-installation")
    expect(text).toContain("- website-shippable-check")
    expect(text).toContain("- functionality-check")
  })

  it("returns error when file read fails (I/O error path)", async () => {
    // Override mock to simulate I/O error
    readFileMock.mockRejectedValueOnce(new Error("simulated read error"))

    const result = await getWorkflow({ workflow_type: "bug-debugging" })
    expect(result.isError).toBe(true)
    const text = result.content[0].text
    expect(text).toContain("# Workflow Retrieval Failed")
    expect(text).toContain('**Workflow:** "bug-debugging"')
    expect(text).toContain(
      "Available workflows: bug-debugging, new-feature, package-installation, website-shippable-check, functionality-check",
    )
  })

  it("registry metadata should expose only workflow_type parameter (no detail_level)", () => {
    const entry = TOOL_REGISTRY.find(t => t.name === "get_workflow")
    expect(entry).toBeTruthy()
    expect(entry?.parameters?.length ?? 0).toBe(1)
    expect(entry?.parameters?.[0]?.name).toBe("workflow_type")
    expect(entry?.description.toLowerCase()).not.toContain("detail_level")
  })
})
