import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test"
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

describe("generate-environments-json", () => {
  let exitSpy: any
  let consoleErrorSpy: any
  let consoleLogSpy: any

  beforeEach(() => {
    // Mock process.exit to prevent test runner from exiting
    exitSpy = spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called")
    })

    // Spy on console methods
    consoleErrorSpy = spyOn(console, "error")
    consoleLogSpy = spyOn(console, "log")
  })

  afterEach(() => {
    // Restore mocks
    exitSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })

  it("should successfully generate environments.json file", async () => {
    // Import and run the script (it runs on import)
    await import("./generate-environments-json.js")

    // Check that the file was created
    const outputPath = join(dirname(__dirname), "environments.json")
    expect(existsSync(outputPath)).toBe(true)

    // Verify success message was logged
    expect(consoleLogSpy).toHaveBeenCalledWith(`✅ Generated ${outputPath}`)
  })

  it("should handle write errors gracefully", async () => {
    // Mock writeFileSync to throw an error
    const fs = await import("node:fs")

    const writeError = new Error("EACCES: permission denied")
    const writeSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw writeError
    })

    try {
      // This should throw because we mocked process.exit
      // @ts-expect-error - Query params used to bypass module cache in tests
      await import("./generate-environments-json.js?test=error")
    } catch (error) {
      // Expected - process.exit was called
      expect((error as Error).message).toBe("process.exit called")
    }

    // Verify error handling
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
    expect(consoleErrorSpy.mock.calls[0][0]).toContain("❌ Failed to write environments.json")
    expect(consoleErrorSpy.mock.calls[1][0]).toContain("EACCES: permission denied")
    expect(exitSpy).toHaveBeenCalledWith(1)

    // Restore original function
    writeSpy.mockRestore()
  })

  it("should handle non-Error exceptions", async () => {
    // Mock writeFileSync to throw a string (non-Error)
    const fs = await import("node:fs")

    const writeSpy = spyOn(fs, "writeFileSync").mockImplementation(() => {
      throw "String error"
    })

    try {
      // @ts-expect-error - Query params used to bypass module cache in tests
      await import("./generate-environments-json.js?test=string")
    } catch (error) {
      // Expected - process.exit was called
      expect((error as Error).message).toBe("process.exit called")
    }

    // Verify error handling for non-Error types
    expect(consoleErrorSpy).toHaveBeenCalledTimes(2)
    expect(consoleErrorSpy.mock.calls[1][0]).toContain("String error")
    expect(exitSpy).toHaveBeenCalledWith(1)

    writeSpy.mockRestore()
  })

  it("should preserve JSON formatting with 2-space indentation", async () => {
    const fs = await import("node:fs")
    let capturedJson: string = ""

    const writeSpy = spyOn(fs, "writeFileSync").mockImplementation((_path, data) => {
      capturedJson = data as string
    })

    // @ts-expect-error - Query params used to bypass module cache in tests
    await import("./generate-environments-json.js?test=format")

    // Verify JSON.stringify was called with null, 2 for formatting
    expect(capturedJson).toContain("\n  ") // Should have 2-space indentation
    expect(capturedJson).toContain('"environments"')

    // Parse to ensure it's valid JSON
    expect(() => JSON.parse(capturedJson)).not.toThrow()

    writeSpy.mockRestore()
  })
})
