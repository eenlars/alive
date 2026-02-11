/**
 * Workspace Command Runner
 *
 * Spawns commands as the workspace user with proper privilege dropping.
 * This is the SINGLE SOURCE OF TRUTH for running commands in workspaces.
 *
 * Used by: install_package, build tools, any workspace operations.
 *
 * Why: Ensures correct file ownership and permissions automatically.
 * Pattern: Same as agent-child-runner.ts but for arbitrary commands.
 *
 * SECURITY: Uses sandboxed env — see sandbox-env.ts for details.
 */

import { spawn } from "node:child_process"
import { readFileSync, statSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"
import { getContainerForDomain } from "./container-utils"
import { createSandboxEnv } from "./sandbox-env"

/**
 * Extract domain from a workspace path.
 * e.g., /srv/webalive/sites/example.com/user → example.com
 */
function extractDomainFromPath(workspacePath: string): string | null {
  const match = workspacePath.match(/\/sites\/([^/]+)/)
  return match ? match[1] : null
}

interface WorkspaceCredentials {
  uid: number
  gid: number
}

interface CommandOptions {
  command: string
  args: string[]
  workspaceRoot: string
  timeout?: number
}

interface CommandResult {
  success: boolean
  stdout: string
  stderr: string
  exitCode: number | null
}

/**
 * Get workspace user credentials from directory ownership.
 * This is the SINGLE SOURCE OF TRUTH for "who owns this workspace".
 */
function getWorkspaceCredentials(workspaceRoot: string): WorkspaceCredentials {
  const st = statSync(workspaceRoot)

  if (!st.uid || !st.gid || st.uid === 0 || st.gid === 0) {
    throw new Error(`Invalid workspace owner for ${workspaceRoot}: uid=${st.uid} gid=${st.gid}`)
  }

  return { uid: st.uid, gid: st.gid }
}

export type ServeMode = "dev" | "build" | "unknown"

/**
 * Detect the current serve mode for a workspace by reading its systemd override file.
 *
 * @param workspacePath - The workspace path (e.g., /srv/webalive/sites/example.com/user)
 * @returns "dev" if running Vite dev server, "build" if running production build, "unknown" otherwise
 */
export function detectServeMode(workspacePath: string): ServeMode {
  // Extract domain from workspace path: /srv/webalive/sites/example.com/user -> example.com
  const sitePath = dirname(workspacePath)
  const domain = basename(sitePath)
  const serviceSlug = domain.replace(/\./g, "-")
  const serviceName = `site@${serviceSlug}.service`
  const overrideConf = `/etc/systemd/system/${serviceName}.d/override.conf`

  try {
    const content = readFileSync(overrideConf, "utf-8")
    if (content.includes("bun run dev")) {
      return "dev"
    }
    // "bun run preview" and "bun run start" are both production modes
    if (content.includes("bun run preview") || content.includes("bun run start")) {
      return "build"
    }
    return "unknown"
  } catch {
    // No override file means default (dev mode)
    return "dev"
  }
}

/**
 * Check if workspace needs user switching (not owned by root).
 */
export function shouldUseWorkspaceUser(workspacePath: string): boolean {
  try {
    const st = statSync(workspacePath)
    return st.uid !== 0 && st.gid !== 0
  } catch {
    return false
  }
}

/**
 * Run a command inside an Incus container.
 * All execution happens inside the container's cgroup/namespace boundary.
 */
export async function runInContainer(options: {
  containerName: string
  command: string
  args: string[]
  cwd?: string
  timeout?: number
}): Promise<CommandResult> {
  const { containerName, command, args, cwd, timeout = 60000 } = options

  const incusArgs = ["exec", containerName]
  if (cwd) incusArgs.push("--cwd", cwd)
  incusArgs.push("--", command, ...args)

  console.log(`[container-cmd] Running in ${containerName}: ${command} ${args.join(" ")}`)

  return new Promise((resolve, reject) => {
    const child = spawn("incus", incusArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      console.error("[container-cmd stderr]", chunk.toString().trim())
    })

    child.on("exit", (code: number | null) => {
      console.log(`[container-cmd] Completed with exit code: ${code}`)
      resolve({ success: code === 0, stdout, stderr, exitCode: code })
    })

    child.on("error", (error: Error) => {
      console.error("[container-cmd] Process error:", error)
      reject(error)
    })

    const timeoutId = setTimeout(() => {
      console.error(`[container-cmd] Timeout after ${timeout}ms, killing`)
      child.kill("SIGTERM")
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL")
      }, 5000)
    }, timeout)

    child.on("exit", () => clearTimeout(timeoutId))
  })
}

/**
 * Run a command as the workspace user.
 *
 * This spawns a child process that:
 * 1. Drops privileges to workspace user (via setuid/setgid)
 * 2. Changes to workspace directory
 * 3. Runs the command
 * 4. Returns stdout/stderr/exitCode
 *
 * For container-backed workspaces, routes through incus exec instead.
 *
 * @example
 * const result = await runAsWorkspaceUser({
 *   command: "bun",
 *   args: ["add", "react"],
 *   workspaceRoot: "/srv/webalive/sites/example.com"
 * })
 *
 * if (!result.success) {
 *   console.error("Install failed:", result.stderr)
 * }
 */
export async function runAsWorkspaceUser(options: CommandOptions): Promise<CommandResult> {
  const { command, args, workspaceRoot, timeout = 60000 } = options

  // Container workspace: route ALL execution through incus exec
  const domain = extractDomainFromPath(workspaceRoot)
  const containerName = domain ? getContainerForDomain(domain) : null
  if (containerName) {
    // Map host path to container-internal path
    // /srv/webalive/sites/incus-demo.sonno.tech/user → /srv/site/user
    const containerCwd = "/srv/site/user"
    console.log(`[workspace-cmd] CONTAINER MODE: routing to ${containerName} at ${containerCwd}`)
    return runInContainer({ containerName, command, args, cwd: containerCwd, timeout })
  }

  const { uid, gid } = getWorkspaceCredentials(workspaceRoot)
  const runnerPath = resolve(process.cwd(), "scripts/run-workspace-command.mjs")

  console.log(`[workspace-cmd] Running as ${uid}:${gid}: ${command} ${args.join(" ")}`)
  console.log(`[workspace-cmd] Runner: ${runnerPath}`)
  console.log(`[workspace-cmd] Workspace: ${workspaceRoot}`)

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath], {
      env: {
        // SECURITY: Explicit allowlist — no bridge secrets
        ...createSandboxEnv(),
        NODE_ENV: process.env.NODE_ENV, // Satisfy Next.js ProcessEnv augmentation
        TARGET_UID: String(uid),
        TARGET_GID: String(gid),
        TARGET_CWD: workspaceRoot,
      },
      stdio: ["pipe", "pipe", "pipe"],
    })

    console.log(`[workspace-cmd] Spawned as root (will drop to ${uid}:${gid}): PID ${child.pid}`)

    // Send command request to child via stdin
    const requestJson = JSON.stringify({ command, args, timeout })
    child.stdin.write(requestJson)
    child.stdin.end()

    console.log(`[workspace-cmd] Request sent: ${requestJson}`)

    // Collect output
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
      // Log stderr in real-time for debugging
      console.error("[workspace-cmd stderr]", chunk.toString().trim())
    })

    // Handle completion
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal) {
        console.error(`[workspace-cmd] Process killed by signal: ${signal}`)
        reject(new Error(`Command killed by signal: ${signal}`))
        return
      }

      const success = code === 0

      console.log(`[workspace-cmd] Completed with exit code: ${code}`)

      resolve({
        success,
        stdout,
        stderr,
        exitCode: code,
      })
    })

    // Handle errors
    child.on("error", (error: Error) => {
      console.error("[workspace-cmd] Process error:", error)
      reject(error)
    })

    // Handle timeout
    const timeoutId = setTimeout(() => {
      console.error(`[workspace-cmd] Timeout after ${timeout}ms, killing process`)
      child.kill("SIGTERM")

      setTimeout(() => {
        if (!child.killed) {
          console.error("[workspace-cmd] SIGTERM timeout, sending SIGKILL")
          child.kill("SIGKILL")
        }
      }, 5000)
    }, timeout)

    // Clear timeout on exit
    child.on("exit", () => {
      clearTimeout(timeoutId)
    })
  })
}
