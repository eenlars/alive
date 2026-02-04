/**
 * Spawns Claude Agent SDK in a child process with workspace user credentials.
 * Ensures all file operations inherit correct ownership.
 */

import { spawn } from "node:child_process"
import { statSync } from "node:fs"
import { resolve } from "node:path"

interface WorkspaceCredentials {
  uid: number
  gid: number
}

interface AgentRequest {
  message: string
  model?: string
  maxTurns?: number
  resume?: string
  resumeSessionAt?: string // Resume at specific message UUID (for message deletion)
  systemPrompt?: string | { type: "preset"; preset: "claude_code"; append?: string }
  apiKey?: string
  sessionCookie?: string // For authenticated API calls back to Bridge
  oauthTokens?: Record<string, string> // OAuth tokens keyed by provider (stripe, linear, etc.)
  isAdmin?: boolean // Whether the user is an admin (enables Bash tools)
  isSuperadmin?: boolean // Whether the user is a superadmin (all tools, runs as root)
  permissionMode?: string // Plan mode: "plan" = read-only exploration, "default" = full access
}

function getWorkspaceCredentials(workspaceRoot: string): WorkspaceCredentials {
  const st = statSync(workspaceRoot)

  if (!st.uid || !st.gid || st.uid === 0 || st.gid === 0) {
    throw new Error(`Invalid workspace owner for ${workspaceRoot}: uid=${st.uid} gid=${st.gid}`)
  }

  return { uid: st.uid, gid: st.gid }
}

export function shouldUseChildProcess(workspaceRoot: string): boolean {
  try {
    const st = statSync(workspaceRoot)
    return st.uid !== 0 && st.gid !== 0
  } catch {
    return false
  }
}

export function runAgentChild(workspaceRoot: string, payload: AgentRequest): ReadableStream<Uint8Array> {
  // Use import.meta.dirname (ESM) or fallback to __dirname pattern
  // The script is at apps/web/scripts/run-agent.mjs relative to this file
  const runnerPath = resolve(import.meta.dirname, "../../scripts/run-agent.mjs")

  // SUPERADMIN: Skip privilege drop - run as root
  // Only applies when user is superadmin AND workspace is alive
  let uid: number
  let gid: number
  if (payload.isSuperadmin) {
    uid = 0
    gid = 0
    console.log("[agent-child] 🔓 SUPERADMIN MODE: Running as root (no privilege drop)")
  } else {
    const creds = getWorkspaceCredentials(workspaceRoot)
    uid = creds.uid
    gid = creds.gid
  }

  console.log(`[agent-child] Spawning runner as UID:${uid} GID:${gid}`)
  console.log(`[agent-child] Runner: ${runnerPath}`)
  console.log(`[agent-child] Workspace: ${workspaceRoot}`)

  // Fail explicitly if no API key is available - never silently pass undefined
  const apiKey = payload.apiKey
  if (!apiKey) {
    throw new Error("[agent-child] No API key available. User must provide an API key or have valid OAuth credentials.")
  }

  const child = spawn(process.execPath, [runnerPath], {
    env: {
      ...process.env, // Inherit all environment variables (includes PORT from systemd)
      // Override specific values for child process
      // SUPERADMIN: uid/gid = 0 means run-agent.mjs will skip setuid/setgid
      TARGET_UID: String(uid),
      TARGET_GID: String(gid),
      TARGET_CWD: workspaceRoot,
      ANTHROPIC_API_KEY: apiKey,
      // Pass session cookie for authenticated API calls
      ...(payload.sessionCookie && { ALIVE_SESSION_COOKIE: payload.sessionCookie }),
    },
    stdio: ["pipe", "pipe", "pipe"],
  })

  console.log(`[agent-child] Spawned: PID ${child.pid} (uid=${uid}, gid=${gid})`)

  const requestJson = JSON.stringify(payload)
  child.stdin.write(requestJson)
  child.stdin.end()

  console.log(`[agent-child] Request sent to child (${requestJson.length} bytes)`)

  // Track cleanup state to ensure it only happens once
  // Necessary because multiple events (error + exit) can both trigger cleanup
  let cleaned = false
  let killTimeoutId: NodeJS.Timeout | null = null

  // Store listener references for precise cleanup
  const dataHandler = (chunk: Buffer) => {
    controller.enqueue(new Uint8Array(chunk))
  }

  const endHandler = () => {
    console.log("[agent-child] stdout ended")
    controller.close()
  }

  const errorHandler = (error: Error) => {
    console.error("[agent-child] Process error:", error)
    cleanup()
    controller.error(error)
  }

  const exitHandler = (code: number | null, signal: NodeJS.Signals | null) => {
    if (code !== 0) {
      console.error(`[agent-child] Exited with code ${code}, signal ${signal}`)
    } else {
      console.log("[agent-child] Exited successfully")
    }
    cleanup()
  }

  let controller: ReadableStreamDefaultController<Uint8Array>

  const cleanup = () => {
    if (!cleaned) {
      cleaned = true
      console.log(`[agent-child] Cleanup: PID ${child.pid}`)

      // Clear any pending kill timeout
      if (killTimeoutId) {
        clearTimeout(killTimeoutId)
        killTimeoutId = null
      }

      // Remove only the specific listeners we added
      child.stdout.off("data", dataHandler)
      child.stdout.off("end", endHandler)
      child.off("error", errorHandler)
      child.off("exit", exitHandler)
    }
  }

  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl

      // Attach listeners
      child.stdout.on("data", dataHandler)
      child.stdout.on("end", endHandler)
      child.on("error", errorHandler)
      child.on("exit", exitHandler)
    },

    cancel() {
      console.log("[agent-child] Stream cancelled, killing child")
      cleanup()

      // Try graceful termination first
      child.kill("SIGTERM")

      // If process doesn't exit within 5 seconds, force kill
      killTimeoutId = setTimeout(() => {
        if (!child.killed) {
          console.warn(`[agent-child] SIGTERM timeout, sending SIGKILL to PID ${child.pid}`)
          child.kill("SIGKILL")
        }
      }, 5000)
    },
  })

  child.stderr.on("data", (data: Buffer) => {
    console.error("[agent-child stderr]", data.toString().trim())
  })

  return stream
}
