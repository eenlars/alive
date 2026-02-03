#!/usr/bin/env node
/**
 * Workspace Command Runner
 *
 * Runs arbitrary commands as the workspace user.
 * Spawned by parent route handler with workspace credentials.
 *
 * Protocol:
 *   stdin:  JSON { command: string, args: string[], cwd: string }
 *   stdout: Command stdout
 *   stderr: Command stderr + diagnostic logs
 *   exit:   Command exit code
 *
 * Environment:
 *   TARGET_UID - User ID to drop to
 *   TARGET_GID - Group ID to drop to
 *   TARGET_CWD - Working directory
 */

import { spawnSync } from "node:child_process"
import process from "node:process"

async function readStdinJson() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"))
}

;(async () => {
  try {
    const targetUid = process.env.TARGET_UID && Number(process.env.TARGET_UID)
    const targetGid = process.env.TARGET_GID && Number(process.env.TARGET_GID)
    const targetCwd = process.env.TARGET_CWD

    if (!targetUid || !targetGid) {
      console.error("[run-cmd] ERROR: TARGET_UID and TARGET_GID must be set")
      process.exit(1)
    }

    if (!targetCwd) {
      console.error("[run-cmd] ERROR: TARGET_CWD must be set")
      process.exit(1)
    }

    // Drop privileges BEFORE running command
    if (process.setgid) {
      process.setgid(targetGid)
      console.error(`[run-cmd] Dropped to GID: ${targetGid}`)
    }
    if (process.setuid) {
      process.setuid(targetUid)
      console.error(`[run-cmd] Dropped to UID: ${targetUid}`)
    }

    // Set umask for proper file creation permissions
    process.umask(0o022)

    // Change to workspace directory
    process.chdir(targetCwd)
    console.error(`[run-cmd] Working directory: ${targetCwd}`)
    console.error(`[run-cmd] Running as UID:${process.getuid()} GID:${process.getgid()}`)

    // Read command from stdin
    const request = await readStdinJson()
    const { command, args = [], timeout = 60000 } = request

    if (!command) {
      console.error("[run-cmd] ERROR: command is required")
      process.exit(1)
    }

    console.error(`[run-cmd] Executing: ${command} ${args.join(" ")}`)

    // Run command as workspace user
    const result = spawnSync(command, args, {
      cwd: targetCwd,
      encoding: "utf-8",
      timeout,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"], // Don't inherit stdin
    })

    // Forward stdout
    if (result.stdout) {
      process.stdout.write(result.stdout)
    }

    // Forward stderr
    if (result.stderr) {
      process.stderr.write(result.stderr)
    }

    // Log completion
    console.error(`[run-cmd] Completed with exit code: ${result.status}`)

    // Exit with same code as command
    process.exit(result.status || 0)
  } catch (error) {
    console.error("[run-cmd] ERROR:", error?.stack || String(error))
    process.exit(1)
  }
})()
