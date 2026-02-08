#!/usr/bin/env node
/**
 * Persistent Worker Entry Point
 *
 * Long-running process that handles multiple Claude queries.
 * Communicates with parent via Unix domain socket using NDJSON.
 *
 * IMPORTANT: This worker does NOT import from apps/web.
 * All configuration is passed via IPC from the parent process.
 *
 * Environment:
 *   TARGET_UID - UID to drop privileges to
 *   TARGET_GID - GID to drop privileges to
 *   TARGET_CWD - Workspace directory
 *   WORKER_SOCKET_PATH - Unix socket path for IPC
 *   WORKER_WORKSPACE_KEY - Workspace identifier
 */

import { chownSync, cpSync, existsSync, mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { createConnection } from "node:net"
import { join } from "node:path"
import process from "node:process"

// Base directory for stable session storage
// Each workspace gets its own subdirectory to persist Claude session data
const SESSIONS_BASE_DIR = "/var/lib/claude-sessions"

// IMPORTANT: Import these BEFORE dropping privileges!
// After privilege drop, the worker can't read /root/alive/node_modules/
import { query } from "@anthropic-ai/claude-agent-sdk"
// biome-ignore format: import checker expects a single-line import statement for this package.
import { isOAuthMcpTool, GLOBAL_MCP_PROVIDERS, DEFAULTS, PLAN_MODE_BLOCKED_TOOLS, allowTool, denyTool, isHeavyBashCommand, isAbortError, isTransientNetworkError, isFatalError, formatUncaughtError } from "@webalive/shared"
import { workspaceInternalMcp, toolsInternalMcp } from "@webalive/tools"

// Global unhandled rejection handler - smart handling based on error type
// Pattern from OpenClaw: don't crash on transient network errors or intentional aborts
process.on("unhandledRejection", (reason, _promise) => {
  // AbortError is typically an intentional cancellation (e.g., during shutdown)
  // Log it but don't crash - these are expected during graceful shutdown
  if (isAbortError(reason)) {
    console.warn("[worker] Suppressed AbortError (intentional cancellation):", formatUncaughtError(reason))
    return
  }

  // Transient network errors shouldn't crash the worker
  // They typically resolve on their own or will be retried
  if (isTransientNetworkError(reason)) {
    console.warn("[worker] Non-fatal network error (continuing):", formatUncaughtError(reason))
    return
  }

  // Fatal errors should definitely crash
  if (isFatalError(reason)) {
    console.error("[worker] FATAL unhandled rejection:", formatUncaughtError(reason))
    process.exit(1)
    return
  }

  // Unknown errors - still crash to be safe, but with better logging
  console.error("[worker] Unhandled promise rejection:", formatUncaughtError(reason))
  process.exit(1)
})

process.on("uncaughtException", error => {
  // Transient network errors in sync code (rare but possible)
  if (isTransientNetworkError(error)) {
    console.warn("[worker] Non-fatal uncaught exception (continuing):", formatUncaughtError(error))
    return
  }

  console.error("[worker] FATAL: Uncaught exception:", formatUncaughtError(error))
  process.exit(1)
})

// Metrics
const startTime = Date.now()
let queriesProcessed = 0

// Current query state
let currentRequestId = null
let currentAbortController = null

// Shutdown timeout (10 seconds max wait for query to complete)
const SHUTDOWN_TIMEOUT_MS = 10_000

// Maximum buffer size for NDJSON parser (10 MB - prevents memory exhaustion)
const MAX_BUFFER_SIZE = 10 * 1024 * 1024

// Socket connection timeout (5 seconds)
const SOCKET_CONNECT_TIMEOUT_MS = 5_000

// =============================================================================
// Helper Functions (DRY)
// =============================================================================

/** Clear current query state - used after query completes or errors */
function clearQueryState() {
  currentRequestId = null
  currentAbortController = null
}

/**
 * Sanitize workspace key for use as a directory name.
 * Replaces unsafe characters with underscores.
 */
function sanitizeWorkspaceKey(key) {
  if (!key || typeof key !== "string") return "default"
  // Replace any characters that could cause path issues
  // Allow alphanumeric, dash, underscore, and dot
  return key.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100)
}

/**
 * Ensure stable session home directory exists with proper ownership.
 * Creates /var/lib/claude-sessions/<workspace>/ for persistent session storage.
 *
 * @param {string} workspaceKey - The workspace identifier
 * @param {number} uid - Target user ID
 * @param {number} gid - Target group ID
 * @returns {string} Path to the stable home directory
 */
function ensureStableSessionHome(workspaceKey, uid, gid) {
  const sanitizedKey = sanitizeWorkspaceKey(workspaceKey)
  const stableHome = join(SESSIONS_BASE_DIR, sanitizedKey)

  try {
    // Create directory if it doesn't exist
    if (!existsSync(stableHome)) {
      mkdirSync(stableHome, { recursive: true, mode: 0o700 })
      console.error(`[worker] Created stable session home: ${stableHome}`)
    }

    // Ensure correct ownership
    chownSync(stableHome, uid, gid)

    return stableHome
  } catch (error) {
    // If we can't create stable home (e.g., permissions), fall back to temp
    console.error(`[worker] Failed to create stable session home: ${error.message}`)
    console.error("[worker] Falling back to temp directory")
    return null
  }
}

// allowTool and denyTool imported from @webalive/shared

// =============================================================================
// NDJSON IPC Client
// =============================================================================

class IpcClient {
  constructor(socketPath) {
    this.socketPath = socketPath
    this.socket = null
    this.buffer = ""
    this.onMessage = null
  }

  async connect() {
    return new Promise((resolve, reject) => {
      let connected = false

      // Connection timeout to prevent hanging indefinitely
      const timeoutId = setTimeout(() => {
        if (!connected) {
          this.socket?.destroy()
          reject(new Error(`Socket connection timed out after ${SOCKET_CONNECT_TIMEOUT_MS}ms`))
        }
      }, SOCKET_CONNECT_TIMEOUT_MS)

      this.socket = createConnection(this.socketPath)

      this.socket.on("connect", () => {
        connected = true
        clearTimeout(timeoutId)
        console.error(`[worker] Connected to ${this.socketPath}`)
        resolve()
      })

      this.socket.on("data", chunk => this.handleData(chunk))

      this.socket.on("close", () => {
        console.error("[worker] Socket closed, exiting")
        process.exit(0)
      })

      this.socket.on("error", err => {
        clearTimeout(timeoutId)
        console.error("[worker] Socket error:", err.message)
        reject(err)
      })
    })
  }

  handleData(chunk) {
    this.buffer += chunk.toString()

    // Prevent memory exhaustion from unbounded buffer growth
    if (this.buffer.length > MAX_BUFFER_SIZE) {
      console.error(`[worker] FATAL: IPC buffer exceeded ${MAX_BUFFER_SIZE} bytes`)
      this.buffer = ""
      process.exit(1)
    }

    let newlineIndex
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)

      if (line.length === 0) continue

      try {
        const msg = JSON.parse(line)
        this.onMessage?.(msg)
      } catch (_err) {
        console.error("[worker] Failed to parse message:", line.slice(0, 200))
      }
    }
  }

  send(msg) {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(`${JSON.stringify(msg)}\n`)
    }
  }

  close() {
    if (this.socket) {
      this.socket.destroy()
    }
  }
}

// =============================================================================
// Privilege Dropping
// =============================================================================

function dropPrivileges() {
  const targetUid = process.env.TARGET_UID && Number(process.env.TARGET_UID)
  const targetGid = process.env.TARGET_GID && Number(process.env.TARGET_GID)
  const targetCwd = process.env.TARGET_CWD

  // Validate UID/GID are reasonable values (not NaN, not negative)
  if (targetUid !== undefined && targetUid !== 0) {
    if (Number.isNaN(targetUid) || targetUid < 0) {
      console.error(`[worker] FATAL: Invalid TARGET_UID: ${process.env.TARGET_UID}`)
      process.exit(1)
    }
  }
  if (targetGid !== undefined && targetGid !== 0) {
    if (Number.isNaN(targetGid) || targetGid < 0) {
      console.error(`[worker] FATAL: Invalid TARGET_GID: ${process.env.TARGET_GID}`)
      process.exit(1)
    }
  }

  // Set up HOME directory for Claude session persistence
  // Uses stable directory per workspace so sessions survive worker restarts
  const originalHome = process.env.HOME || "/root"
  const workspaceKey = process.env.WORKER_WORKSPACE_KEY

  // CRITICAL: Set CLAUDE_CONFIG_DIR to a single source of truth for credentials
  // Prefer a pre-set CLAUDE_CONFIG_DIR (if provided by the service),
  // otherwise default to /root/.claude.
  // Sessions (conversation history) still persist per-workspace via HOME.
  const configuredClaudeDir = process.env.CLAUDE_CONFIG_DIR
  const defaultClaudeDir = join(originalHome, ".claude")
  if (configuredClaudeDir && configuredClaudeDir.startsWith("/")) {
    process.env.CLAUDE_CONFIG_DIR = configuredClaudeDir
  } else {
    if (configuredClaudeDir && !configuredClaudeDir.startsWith("/")) {
      console.error(`[worker] Ignoring invalid CLAUDE_CONFIG_DIR (must be absolute): ${configuredClaudeDir}`)
    }
    process.env.CLAUDE_CONFIG_DIR = defaultClaudeDir
  }

  // Try to use stable session home for this workspace
  // Falls back to temp directory if stable home creation fails
  let workerHome = ensureStableSessionHome(workspaceKey, targetUid, targetGid)

  if (workerHome) {
    // Using stable session home - sessions will persist across restarts
    const claudeDir = join(workerHome, ".claude")

    // Create .claude subdirectory if it doesn't exist
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { mode: 0o700 })
      chownSync(claudeDir, targetUid, targetGid)
    }

    // Note: Credentials are NOT copied here anymore.
    // CLAUDE_CONFIG_DIR points to /root/.claude/ so all workers share one credentials file.
    // This ensures token refreshes from /login are immediately visible to all workers.

    // Copy global skills from /etc/claude-code/skills/ to user's .claude/skills/
    const globalSkillsPath = "/etc/claude-code/skills"
    const userSkillsPath = join(claudeDir, "skills")
    if (existsSync(globalSkillsPath)) {
      try {
        cpSync(globalSkillsPath, userSkillsPath, { recursive: true })
        console.error(`[worker] Copied global skills to ${userSkillsPath}`)
      } catch (e) {
        console.error(`[worker] Failed to copy skills: ${e.message}`)
      }
    }

    process.env.HOME = workerHome
    console.error(`[worker] Using stable session home: ${workerHome}`)
    console.error(`[worker] Using shared credentials from: ${process.env.CLAUDE_CONFIG_DIR}`)
  } else {
    // Fallback: use temp directory (sessions won't persist, but won't crash)
    console.error("[worker] WARN: Using temp home - sessions will not persist across restarts")
    const tempHome = mkdtempSync(join(tmpdir(), `claude-home-${targetUid}-`))
    const claudeDir = join(tempHome, ".claude")

    mkdirSync(claudeDir, { mode: 0o700 })
    chownSync(tempHome, targetUid, targetGid)
    chownSync(claudeDir, targetUid, targetGid)

    process.env.HOME = tempHome
    console.error(`[worker] Using temp home: ${tempHome}`)
    console.error(`[worker] Using shared credentials from: ${process.env.CLAUDE_CONFIG_DIR}`)

    const globalSkillsPath = "/etc/claude-code/skills"
    const userSkillsPath = join(claudeDir, "skills")
    if (existsSync(globalSkillsPath)) {
      try {
        cpSync(globalSkillsPath, userSkillsPath, { recursive: true })
        console.error(`[worker] Copied global skills to ${userSkillsPath}`)
      } catch (e) {
        console.error(`[worker] Failed to copy skills: ${e.message}`)
      }
    }
  }

  // Ensure temp directory is writable by the workspace user
  const tempDir = join(process.env.HOME || "/tmp", "tmp")
  try {
    if (!existsSync(tempDir)) {
      mkdirSync(tempDir, { recursive: true, mode: 0o700 })
    }
    if (typeof targetUid === "number" && typeof targetGid === "number") {
      chownSync(tempDir, targetUid, targetGid)
    }
    process.env.TMPDIR = tempDir
    process.env.TMP = tempDir
    process.env.TEMP = tempDir
    console.error(`[worker] TMPDIR set to: ${tempDir}`)
  } catch (error) {
    console.error(`[worker] Failed to set TMPDIR: ${error.message}`)
  }

  // Drop privileges with validation
  // CRITICAL: Must drop GID before UID (can't setgid after dropping root UID)
  try {
    if (targetGid && process.setgid) {
      process.setgid(targetGid)
      const actualGid = process.getgid()
      if (actualGid !== targetGid) {
        throw new Error(`GID mismatch: expected ${targetGid}, got ${actualGid}`)
      }
      console.error(`[worker] Dropped to GID: ${targetGid}`)
    }

    if (targetUid && process.setuid) {
      process.setuid(targetUid)
      const actualUid = process.getuid()
      if (actualUid !== targetUid) {
        throw new Error(`UID mismatch: expected ${targetUid}, got ${actualUid}`)
      }
      console.error(`[worker] Dropped to UID: ${targetUid}`)
    }

    // Verify we're not still running as root when we should have dropped
    if (targetUid && targetUid !== 0 && process.getuid() === 0) {
      throw new Error("Still running as root after privilege drop!")
    }
    if (targetGid && targetGid !== 0 && process.getgid() === 0) {
      throw new Error("Still running as GID 0 after privilege drop!")
    }
  } catch (error) {
    console.error(`[worker] FATAL: Privilege drop failed: ${error.message}`)
    process.exit(1)
  }

  process.umask(0o022)

  if (targetCwd) {
    // SECURITY: Validate TARGET_CWD before use
    if (typeof targetCwd !== "string" || targetCwd.length === 0) {
      console.error("[worker] FATAL: TARGET_CWD must be non-empty string")
      process.exit(1)
    }
    if (!targetCwd.startsWith("/")) {
      console.error(`[worker] FATAL: TARGET_CWD must be absolute path, got: ${targetCwd}`)
      process.exit(1)
    }
    if (targetCwd.includes("..")) {
      console.error(`[worker] FATAL: TARGET_CWD contains path traversal: ${targetCwd}`)
      process.exit(1)
    }

    try {
      process.chdir(targetCwd)
      console.error(`[worker] Changed to workspace: ${targetCwd}`)
    } catch (error) {
      console.error(`[worker] FATAL: Cannot access workspace ${targetCwd}: ${error.message}`)
      process.exit(1)
    }
  }

  console.error(`[worker] Working directory: ${process.cwd()}`)
  console.error(`[worker] Running as UID:${process.getuid()} GID:${process.getgid()}`)
}

// =============================================================================
// Query Handling
// =============================================================================

async function handleQuery(ipc, requestId, payload) {
  const queryStartTime = Date.now()
  const timing = label => console.error(`[worker ${requestId}] [TIMING] ${label}: +${Date.now() - queryStartTime}ms`)

  timing("query_received")

  // NOTE: query, isOAuthMcpTool, workspaceInternalMcp, toolsInternalMcp are imported
  // at the top level BEFORE privilege drop. After dropping privileges, the worker
  // can't read /root/alive/node_modules/

  // Get configuration from payload - NO imports from apps/web
  const { agentConfig } = payload
  if (!agentConfig) {
    ipc.send({ type: "error", requestId, error: "Missing agentConfig in payload" })
    clearQueryState()
    return
  }

  const {
    allowedTools,
    disallowedTools,
    permissionMode,
    settingSources,
    oauthMcpServers, // Only OAuth HTTP servers are serializable via IPC
    bridgeStreamTypes,
  } = agentConfig

  // Input validation - prevent type confusion attacks
  const validationErrors = []

  // Required string field
  if (typeof payload.message !== "string") {
    validationErrors.push("message must be a string")
  }

  // Required agentConfig fields
  if (!Array.isArray(allowedTools)) {
    validationErrors.push("allowedTools must be an array")
  } else if (!allowedTools.every(t => typeof t === "string")) {
    validationErrors.push("allowedTools must contain only strings")
  }
  if (!Array.isArray(disallowedTools)) {
    validationErrors.push("disallowedTools must be an array")
  } else if (!disallowedTools.every(t => typeof t === "string")) {
    validationErrors.push("disallowedTools must contain only strings")
  }
  if (typeof permissionMode !== "string") {
    validationErrors.push("permissionMode must be a string")
  }
  if (!Array.isArray(settingSources)) {
    validationErrors.push("settingSources must be an array")
  } else if (!settingSources.every(s => typeof s === "string")) {
    validationErrors.push("settingSources must contain only strings")
  }
  if (!bridgeStreamTypes || typeof bridgeStreamTypes !== "object") {
    validationErrors.push("bridgeStreamTypes must be an object")
  } else {
    // Validate individual bridgeStreamTypes properties
    const streamTypeFields = ["SESSION", "MESSAGE", "COMPLETE", "ERROR"]
    for (const field of streamTypeFields) {
      if (typeof bridgeStreamTypes[field] !== "string") {
        validationErrors.push(`bridgeStreamTypes.${field} must be a string`)
      }
    }
  }

  // Optional string fields (validate type if present)
  if (payload.sessionCookie !== undefined && typeof payload.sessionCookie !== "string") {
    validationErrors.push("sessionCookie must be a string")
  }
  if (payload.model !== undefined && typeof payload.model !== "string") {
    validationErrors.push("model must be a string")
  }
  if (payload.systemPrompt !== undefined && typeof payload.systemPrompt !== "string") {
    validationErrors.push("systemPrompt must be a string")
  }
  if (payload.resume !== undefined && typeof payload.resume !== "string") {
    validationErrors.push("resume must be a string")
  }
  if (payload.apiKey !== undefined && typeof payload.apiKey !== "string") {
    validationErrors.push("apiKey must be a string")
  }

  // Optional numeric field (validate type and bounds if present)
  if (payload.maxTurns !== undefined) {
    if (!Number.isInteger(payload.maxTurns) || payload.maxTurns < 1) {
      validationErrors.push("maxTurns must be a positive integer")
    }
  }

  // Optional object fields
  if (oauthMcpServers !== undefined && (typeof oauthMcpServers !== "object" || oauthMcpServers === null)) {
    validationErrors.push("oauthMcpServers must be an object")
  }
  if (payload.oauthTokens !== undefined && (typeof payload.oauthTokens !== "object" || payload.oauthTokens === null)) {
    validationErrors.push("oauthTokens must be an object")
  }
  if (payload.userEnvKeys !== undefined && (typeof payload.userEnvKeys !== "object" || payload.userEnvKeys === null)) {
    validationErrors.push("userEnvKeys must be an object")
  }

  if (validationErrors.length > 0) {
    ipc.send({ type: "error", requestId, error: `Invalid payload: ${validationErrors.join(", ")}` })
    clearQueryState()
    return
  }

  currentAbortController = new AbortController()
  const { signal } = currentAbortController

  // Declare these outside try so they're accessible in catch
  let messageCount = 0
  let queryResult = null
  let stderrBuffer = [] // Captures Claude subprocess stderr for error debugging

  try {
    // SECURITY: Always set/clear session cookie at start of each request
    // This prevents cookie leakage between requests from different users
    // If payload has cookie, use it; otherwise clear any previous value
    process.env.ALIVE_SESSION_COOKIE = payload.sessionCookie || ""

    // API key handling:
    // - For user-provided API keys: pass via payload.apiKey
    // - For OAuth: SDK reads from CLAUDE_CONFIG_DIR/.credentials.json directly
    //   (file permissions must be 644 so workers can read after dropping privileges)
    if (payload.apiKey) {
      process.env.ANTHROPIC_API_KEY = payload.apiKey
      console.error("[worker] Using user-provided API key from payload")
    } else {
      // Don't set ANTHROPIC_API_KEY - let SDK use OAuth from credentials file
      delete process.env.ANTHROPIC_API_KEY
      console.error("[worker] Using OAuth credentials from CLAUDE_CONFIG_DIR")
    }

    // Set user-defined environment keys (custom API keys from lockbox)
    // These are prefixed with USER_ to avoid conflicts with system env vars
    // SECURITY: Clear any previous user env keys before setting new ones
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("USER_")) {
        delete process.env[key]
      }
    }
    const userEnvKeys = payload.userEnvKeys || {}
    const userEnvKeyCount = Object.keys(userEnvKeys).length
    if (userEnvKeyCount > 0) {
      for (const [keyName, keyValue] of Object.entries(userEnvKeys)) {
        // Only set if the key name is valid format (uppercase alphanumeric + underscore)
        if (/^[A-Z][A-Z0-9_]*$/.test(keyName)) {
          process.env[`USER_${keyName}`] = keyValue
        }
      }
      console.error(`[worker] Set ${userEnvKeyCount} user environment key(s)`)
    }

    // Get OAuth tokens for connected MCP providers
    const oauthTokens = payload.oauthTokens || {}
    const connectedProviders = Object.keys(oauthTokens).filter(key => !!oauthTokens[key])
    if (connectedProviders.length > 0) {
      console.error(`[worker] Connected OAuth providers: ${connectedProviders.join(", ")}`)
    }

    console.error(`[worker] Allowed tools count: ${allowedTools.length}`)
    console.error(`[worker] Permission mode: "${permissionMode}"`)

    // Plan mode: block tools that modify files
    // See docs/architecture/plan-mode.md for full explanation
    const isPlanMode = permissionMode === "plan"
    if (isPlanMode) {
      console.error("[worker] PLAN MODE: Write/Edit/Bash tools will be blocked")
    }

    // Tool permission handler
    const canUseTool = async (toolName, input, _options) => {
      // ExitPlanMode requires user approval - Claude cannot approve its own plan
      // The user must click "Approve Plan" in the UI to exit plan mode
      if (toolName === "ExitPlanMode") {
        console.error(`[worker] PLAN MODE: ExitPlanMode blocked - requires user approval`)
        return denyTool(
          `You cannot approve your own plan. The user must review and approve the plan by clicking "Approve Plan" in the UI. ` +
            "Present your plan clearly and wait for user approval before proceeding with implementation.",
        )
      }

      // Plan mode: block modification tools
      if (isPlanMode && PLAN_MODE_BLOCKED_TOOLS.includes(toolName)) {
        console.error(`[worker] PLAN MODE: Blocked modification tool: ${toolName}`)
        return denyTool(
          `Tool "${toolName}" is not allowed in plan mode. Plan mode is for exploration only - Claude can read and analyze but not modify files.`,
        )
      }

      if (disallowedTools.includes(toolName)) {
        console.error(`[worker] SECURITY: Blocked disallowed tool: ${toolName}`)
        return denyTool(`Tool "${toolName}" is explicitly disallowed for security reasons.`)
      }

      // Protect shared compute from expensive monorepo-wide shell commands.
      // Superadmins retain unrestricted execution.
      if (toolName === "Bash" && !agentConfig.isSuperadmin) {
        const command = typeof input?.command === "string" ? input.command : ""
        if (isHeavyBashCommand(command)) {
          console.error("[worker] SECURITY: Blocked heavy Bash command for non-superadmin")
          return denyTool(
            "This Bash command is blocked because it is too heavy for shared capacity. " +
              "Use narrower commands (single package/file) or ask a superadmin to run full builds/checks.",
          )
        }
      }

      if (allowedTools.includes(toolName) || isOAuthMcpTool(toolName, connectedProviders)) {
        return allowTool(input)
      }

      console.error(`[worker] SECURITY: Blocked unauthorized tool: ${toolName}`)
      return denyTool(`Tool "${toolName}" is not permitted.`)
    }

    // Build MCP servers: internal (created locally) + global HTTP + OAuth (received via IPC)
    // Internal SDK MCP servers (workspaceInternalMcp, toolsInternalMcp) cannot be
    // serialized via IPC because createSdkMcpServer returns function objects.
    // They must be imported and created locally in the worker.

    // Build global HTTP MCP servers (always available, no auth required)
    // These are defined in GLOBAL_MCP_PROVIDERS in @webalive/shared
    const globalMcpServers = {}
    for (const [providerKey, config] of Object.entries(GLOBAL_MCP_PROVIDERS)) {
      globalMcpServers[providerKey] = {
        type: "http",
        url: config.url,
      }
    }

    const mcpServers = {
      "alive-workspace": workspaceInternalMcp,
      "alive-tools": toolsInternalMcp,
      ...globalMcpServers,
      ...(oauthMcpServers || {}),
    }

    console.error("[worker] MCP servers enabled:", Object.keys(mcpServers).join(", "))
    console.error("[worker] Resume session:", payload.resume || "none (new session)")
    if (payload.resumeSessionAt) {
      console.error("[worker] Resume at message:", payload.resumeSessionAt)
    }

    timing("before_sdk_query")

    // Capture stderr from Claude Code subprocess for error debugging
    const stderrHandler = message => {
      stderrBuffer.push(message)
      // Keep only last 50 lines to avoid memory bloat
      if (stderrBuffer.length > 50) stderrBuffer.shift()
      // Also log to our stderr for journalctl
      console.error(`[worker:claude-stderr] ${message}`)
    }

    const agentQuery = query({
      prompt: payload.message,
      options: {
        cwd: process.cwd(),
        model: payload.model,
        maxTurns: payload.maxTurns || DEFAULTS.CLAUDE_MAX_TURNS,
        permissionMode,
        ...(permissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
        allowedTools,
        disallowedTools,
        canUseTool,
        settingSources,
        mcpServers,
        systemPrompt: payload.systemPrompt,
        resume: payload.resume,
        resumeSessionAt: payload.resumeSessionAt,
        abortSignal: signal,
        stderr: stderrHandler,
      },
    })

    let firstMessageLogged = false

    for await (const message of agentQuery) {
      // Log first message timing
      if (!firstMessageLogged) {
        firstMessageLogged = true
        timing("first_sdk_message")
      }

      // Check for cancellation
      if (signal.aborted) {
        console.error("[worker] Query aborted")
        break
      }

      messageCount++

      if (message.type === "result") {
        queryResult = message
      }

      // Capture session ID from system init message
      if (message.type === "system" && message.subtype === "init" && message.session_id) {
        console.error(`[worker] Session ID: ${message.session_id}`)
        ipc.send({
          type: "session",
          requestId,
          sessionId: message.session_id,
        })
      }

      // Filter system init message to only show allowed tools
      let outputMessage = message
      if (message.type === "system" && message.subtype === "init" && message.tools) {
        outputMessage = {
          ...message,
          tools: message.tools.filter(tool => allowedTools.includes(tool) || isOAuthMcpTool(tool, connectedProviders)),
        }
      }

      // Stream message to parent
      ipc.send({
        type: "message",
        requestId,
        content: {
          type: bridgeStreamTypes.MESSAGE,
          messageCount,
          messageType: message.type,
          content: outputMessage,
        },
      })
    }

    // Send completion (include cancelled flag if aborted)
    const wasCancelled = signal.aborted
    ipc.send({
      type: "complete",
      requestId,
      result: {
        type: bridgeStreamTypes.COMPLETE,
        totalMessages: messageCount,
        result: queryResult,
        cancelled: wasCancelled,
      },
    })

    queriesProcessed++
    const status = wasCancelled ? "cancelled" : "complete"
    console.error(`[worker] Query ${status}: ${messageCount} messages (total: ${queriesProcessed})`)
  } catch (error) {
    // Check if we already received a successful result before the error
    // The Claude Code CLI sometimes exits with code 1 AFTER yielding all messages including the result
    // In this case, treat it as success since we have the complete response
    if (queryResult && queryResult.subtype === "success") {
      console.error("[worker] Query completed with result before error - treating as success")
      console.error("[worker] (Suppressed error:", error?.message || String(error), ")")

      // Send completion with the result we already have
      ipc.send({
        type: "complete",
        requestId,
        result: {
          type: bridgeStreamTypes.COMPLETE,
          totalMessages: messageCount,
          result: queryResult,
          cancelled: false,
        },
      })

      queriesProcessed++
      console.error(`[worker] Query complete: ${messageCount} messages (total: ${queriesProcessed})`)
    } else {
      // No result yet - this is a real error
      const stderrOutput = stderrBuffer?.length ? stderrBuffer.join("\n") : null
      console.error("[worker] Query error:", error?.stack || String(error))
      if (stderrOutput) {
        console.error("[worker] Claude stderr:", stderrOutput)
      }
      ipc.send({
        type: "error",
        requestId,
        error: error?.message || String(error),
        stack: error?.stack,
        stderr: stderrOutput,
      })
    }
  } finally {
    clearQueryState()
  }
}

function handleCancel(requestId) {
  if (currentRequestId === requestId && currentAbortController) {
    console.error(`[worker] Cancelling query: ${requestId}`)
    currentAbortController.abort()
    // CRITICAL: Clear state immediately so worker can accept new queries
    // The handleQuery finally block will also call clearQueryState() but that's harmless
    clearQueryState()
    console.error("[worker] Query state cleared after cancel")
  }
}

async function handleShutdown(ipc, graceful) {
  console.error(`[worker] Shutdown requested (graceful: ${graceful})`)

  if (graceful && currentRequestId) {
    console.error("[worker] Waiting for current query to complete (max 10s)...")

    // Wait with timeout - don't block forever
    const startWait = Date.now()
    while (currentRequestId && Date.now() - startWait < SHUTDOWN_TIMEOUT_MS) {
      await new Promise(r => setTimeout(r, 100))
    }

    if (currentRequestId) {
      console.error("[worker] Timeout waiting for query, aborting...")
      currentAbortController?.abort()
      // Give it a moment to clean up
      await new Promise(r => setTimeout(r, 500))
    }
  }

  ipc.send({ type: "shutdown_ack" })
  console.error("[worker] Shutdown acknowledged, exiting")
  process.exit(0)
}

function handleHealthCheck(ipc) {
  const uptime = Math.floor((Date.now() - startTime) / 1000)
  ipc.send({
    type: "health_ok",
    uptime,
    queriesProcessed,
  })
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const socketPath = process.env.WORKER_SOCKET_PATH
  const workspaceKey = process.env.WORKER_WORKSPACE_KEY

  if (!socketPath) {
    console.error("[worker] WORKER_SOCKET_PATH not set")
    process.exit(1)
  }

  console.error(`[worker] Starting persistent worker for ${workspaceKey}`)
  console.error(`[worker] Socket: ${socketPath}`)

  // Connect to parent via Unix socket BEFORE dropping privileges
  // The socket directory has restrictive permissions (0o700 root only)
  // so we must connect while still running as root
  const ipc = new IpcClient(socketPath)

  try {
    await ipc.connect()
    console.error("[worker] Connected to IPC socket")
  } catch (error) {
    console.error("[worker] Failed to connect:", error?.message || String(error))
    process.exit(1)
  }

  // Now drop privileges - the socket connection stays open
  dropPrivileges()
  ipc.onMessage = msg => {
    // SECURITY: Validate message structure
    if (!msg || typeof msg !== "object" || typeof msg.type !== "string") {
      console.error("[worker] Invalid message received:", msg)
      return
    }

    switch (msg.type) {
      case "query": {
        // SECURITY: Validate required fields
        if (typeof msg.requestId !== "string" || !msg.requestId) {
          console.error("[worker] Query message missing valid requestId")
          return
        }
        if (!msg.payload || typeof msg.payload !== "object") {
          console.error("[worker] Query message missing valid payload")
          ipc.send({ type: "error", requestId: msg.requestId, error: "Invalid payload" })
          return
        }

        if (currentRequestId) {
          // Worker is busy - reject immediately
          // The parent should handle queuing or routing to another worker
          ipc.send({
            type: "error",
            requestId: msg.requestId,
            error: "Worker busy - already processing a query",
          })
          return
        }
        currentRequestId = msg.requestId
        // IMPORTANT: Must catch any unhandled promise rejections
        // If handleQuery rejects and we don't catch it, the parent never
        // receives complete/error and thinks the worker is still busy forever
        handleQuery(ipc, msg.requestId, msg.payload).catch(err => {
          console.error("[worker] FATAL: Unhandled error in handleQuery:", err)
          ipc.send({
            type: "error",
            requestId: msg.requestId,
            error: `Unhandled worker error: ${err?.message || String(err)}`,
          })
          clearQueryState()
        })
        break
      }
      case "cancel":
        // SECURITY: Validate requestId for cancel
        if (typeof msg.requestId !== "string" || !msg.requestId) {
          console.error("[worker] Cancel message missing valid requestId")
          return
        }
        handleCancel(msg.requestId)
        break
      case "shutdown":
        handleShutdown(ipc, !!msg.graceful).catch(err => {
          console.error("[worker] FATAL: Shutdown failed:", err)
          process.exit(1)
        })
        break
      case "health_check":
        handleHealthCheck(ipc)
        break
      default:
        console.error(`[worker] Unknown message type: ${msg.type}`)
    }
  }

  // Signal ready to parent
  ipc.send({ type: "ready" })
  console.error("[worker] Ready and waiting for queries")

  // Keep process alive
  // The socket 'close' event will trigger exit
}

main().catch(err => {
  console.error("[worker] FATAL: Worker main() failed:", err)
  process.exit(1)
})
