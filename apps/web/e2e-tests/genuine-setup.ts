/**
 * Global Setup for Genuine E2E Tests
 *
 * Creates test workspace with proper structure before tests run.
 * This ensures tests have a valid working directory for Claude operations.
 */

import { execSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { TEST_WORKSPACE } from "./fixtures/test-data"

const TEST_WORKSPACE_PATH = TEST_WORKSPACE.path

export default async function globalSetup() {
  console.log("[Genuine Setup] Creating test workspace...")

  // Remove existing workspace if it exists
  if (existsSync(TEST_WORKSPACE_PATH)) {
    console.log("[Genuine Setup] Removing existing test workspace...")
    execSync(`rm -rf "${TEST_WORKSPACE_PATH}"`, { stdio: "ignore" })
  }

  // Create workspace directory
  mkdirSync(TEST_WORKSPACE_PATH, { recursive: true })

  // Create minimal valid workspace structure
  const minimalPackageJson = {
    name: "test-workspace",
    version: "1.0.0",
    private: true,
    type: "module",
    scripts: {
      dev: "echo 'Test workspace'",
    },
  }

  const minimalIndexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Test Workspace</title>
</head>
<body>
  <h1>Test Workspace</h1>
</body>
</html>`

  // Write files
  writeFileSync(path.join(TEST_WORKSPACE_PATH, "package.json"), JSON.stringify(minimalPackageJson, null, 2))

  writeFileSync(path.join(TEST_WORKSPACE_PATH, "index.html"), minimalIndexHtml)

  // Create src directory (common structure for workspaces)
  mkdirSync(path.join(TEST_WORKSPACE_PATH, "src"), { recursive: true })

  // Create a test file Claude can read/write
  writeFileSync(
    path.join(TEST_WORKSPACE_PATH, "README.md"),
    "# Test Workspace\n\nThis is a test workspace for genuine E2E tests.\n",
  )

  console.log("[Genuine Setup] Test workspace created successfully at:", TEST_WORKSPACE_PATH)
  console.log("[Genuine Setup] Structure created:")
  console.log("  - package.json")
  console.log("  - index.html")
  console.log("  - src/")
  console.log("  - README.md")
}
