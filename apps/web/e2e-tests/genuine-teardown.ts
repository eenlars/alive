/**
 * Global Teardown for Genuine E2E Tests
 *
 * Cleans up test workspace after all tests complete.
 */

import { execSync } from "node:child_process"
import { existsSync } from "node:fs"
import { TEST_WORKSPACE } from "./fixtures/test-data"

const TEST_WORKSPACE_PATH = TEST_WORKSPACE.path

export default async function globalTeardown() {
  console.log("[Genuine Teardown] Cleaning up test workspace...")

  if (existsSync(TEST_WORKSPACE_PATH)) {
    try {
      execSync(`rm -rf "${TEST_WORKSPACE_PATH}"`, { stdio: "ignore" })
      console.log("[Genuine Teardown] Test workspace removed successfully")
    } catch (error) {
      console.error("[Genuine Teardown] Failed to remove test workspace:", error)
    }
  } else {
    console.log("[Genuine Teardown] Test workspace does not exist, nothing to clean")
  }
}
