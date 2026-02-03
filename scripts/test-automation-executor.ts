/**
 * Test script to verify automation executor works
 * Run: bun scripts/test-automation-executor.ts
 */

import { runAutomationJob } from "../apps/web/lib/automation/executor"

const testParams = {
  jobId: "test-manual-" + Date.now(),
  userId: "test-user",
  orgId: "test-org",
  workspace: "zomaar.alive.best",
  prompt: "List the files in the current directory and report what you see. Do not make any changes.",
  timeoutSeconds: 60,
}

console.log("Testing automation executor...")
console.log("Params:", testParams)
console.log("")

try {
  const result = await runAutomationJob(testParams)
  console.log("\nResult:", JSON.stringify(result, null, 2))
} catch (error) {
  console.error("\nError:", error)
}
