#!/usr/bin/env node
/**
 * Child Process Agent Runner
 *
 * Runs Claude Agent SDK as the workspace user.
 * Spawned by parent route handler with workspace credentials.
 *
 * Protocol:
 *   stdin:  JSON request payload
 *   stdout: NDJSON event stream
 *   stderr: Diagnostic logs
 */

import { chownSync, existsSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import process from "node:process"
import { query } from "@anthropic-ai/claude-agent-sdk"
import { allowTool, DEFAULTS, denyTool, isOAuthMcpTool, PLAN_MODE_BLOCKED_TOOLS } from "@webalive/shared"
import {
  getAllowedTools,
  getDisallowedTools,
  getMcpServers,
  PERMISSION_MODE,
  SETTINGS_SOURCES,
  STREAM_TYPES,
} from "../lib/claude/agent-constants.mjs"

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

    // Set HOME to workspace user's actual home directory.
    // TARGET_HOME is set by agent-child-runner.ts (e.g. /srv/webalive/sites/domain.com).
    // This is where the user's own tool configs (gh, git, etc.) live.
    // For superadmin, HOME stays as-is (inherited from parent = /root).
    const targetHome = process.env.TARGET_HOME
    if (targetHome) {
      process.env.HOME = targetHome
      // Ensure the SDK can write its .claude/ session dir inside the workspace home
      const claudeDir = join(targetHome, ".claude")
      if (!existsSync(claudeDir)) {
        try {
          mkdirSync(claudeDir, { recursive: true, mode: 0o700 })
          if (targetUid && targetGid) {
            chownSync(claudeDir, targetUid, targetGid)
          }
        } catch {
          // Non-fatal: SDK will fall back to ANTHROPIC_API_KEY auth
          console.error(`[runner] Could not create ${claudeDir}, continuing`)
        }
      }
      console.error(`[runner] HOME set to workspace: ${targetHome}`)
    }

    // SUPERADMIN MODE: uid/gid = 0 means skip privilege drop (run as root)
    // This is only set when user is superadmin AND workspace is alive
    if (targetUid === 0 && targetGid === 0) {
      console.error("[runner] 🔓 SUPERADMIN MODE: Skipping privilege drop (running as root)")
    } else {
      if (targetGid && process.setgid) {
        process.setgid(targetGid)
        console.error(`[runner] Dropped to GID: ${targetGid}`)
      }
      if (targetUid && process.setuid) {
        process.setuid(targetUid)
        console.error(`[runner] Dropped to UID: ${targetUid}`)
      }
    }

    process.umask(0o022)

    if (targetCwd) {
      process.chdir(targetCwd)
      console.error(`[runner] Changed to workspace: ${targetCwd}`)
    }

    console.error(`[runner] Working directory: ${process.cwd()}`)
    console.error(`[runner] Running as UID:${process.getuid()} GID:${process.getgid()}`)
    console.error(`[runner] HOME: ${process.env.HOME}`)

    const request = await readStdinJson()
    console.error(`[runner] Received request: ${request.message?.substring(0, 50)}...`)

    // Get OAuth tokens for connected MCP providers
    const oauthTokens = request.oauthTokens || {}
    const connectedProviders = Object.keys(oauthTokens).filter(key => !!oauthTokens[key])
    if (connectedProviders.length > 0) {
      console.error(`[runner] Connected OAuth providers: ${connectedProviders.join(", ")}`)
    }

    // Check admin/superadmin status from request payload
    const isAdmin = request.isAdmin === true
    const isSuperadmin = request.isSuperadmin === true
    console.error(`[runner] isAdmin: ${isAdmin}, isSuperadmin: ${isSuperadmin}`)

    // Plan mode: use from request or fall back to default
    const effectivePermissionMode = request.permissionMode || PERMISSION_MODE
    const isPlanMode = effectivePermissionMode === "plan"
    if (isPlanMode) {
      console.error("[runner] 🔒 PLAN MODE ENABLED: Write/Edit/Bash tools will be blocked")
    }

    // Get base allowed tools (SDK + internal MCP tools)
    // OAuth MCP tools are allowed dynamically in canUseTool
    // Admin users get Bash, BashOutput, TaskStop tools
    // Superadmin users get ALL tools (Task, WebSearch included)
    // isSuperadmin is also used as isSuperadminWorkspace — the alive workspace
    // is the only superadmin workspace, and site-specific tools (switch_serve_mode, etc.)
    // should not be available there since it's not a Vite site.
    const baseAllowedTools = getAllowedTools(targetCwd || process.cwd(), isAdmin, isSuperadmin, isSuperadmin)
    const disallowedTools = getDisallowedTools(isAdmin, isSuperadmin)

    // Plan mode: Filter out blocked tools from allowedTools
    // The SDK auto-allows tools in allowedTools without calling canUseTool,
    // so we must remove them from the list to enforce plan mode restrictions
    const effectiveAllowedTools = isPlanMode
      ? baseAllowedTools.filter(t => !PLAN_MODE_BLOCKED_TOOLS.includes(t))
      : baseAllowedTools

    console.error(`[runner] Base allowed tools count: ${baseAllowedTools.length}`)
    if (isPlanMode) {
      console.error(
        `[runner] 🔒 PLAN MODE: Filtered to ${effectiveAllowedTools.length} tools (removed ${baseAllowedTools.length - effectiveAllowedTools.length} modification tools)`,
      )
    }
    if (isSuperadmin) {
      const hasTask = baseAllowedTools.includes("Task")
      const hasWebSearch = baseAllowedTools.includes("WebSearch")
      console.error(
        `[runner] 🔓 SUPERADMIN tools: Task=${hasTask}, WebSearch=${hasWebSearch}, disallowed=${disallowedTools.length}`,
      )
    } else if (isAdmin) {
      const hasBash = baseAllowedTools.includes("Bash")
      console.error(`[runner] Admin tools: Bash=${hasBash}, disallowed=${disallowedTools.length}`)
    }

    /**
     * Tool permission handler - enforces disallowedTools blacklist and dynamic OAuth MCP tool permissions
     * Uses allowTool/denyTool helpers from @webalive/shared
     * @type {import('@anthropic-ai/claude-agent-sdk').CanUseTool}
     */
    const canUseTool = async (toolName, input, _options) => {
      // Plan mode: block modification tools (backup check - primary filtering is in allowedTools)
      if (isPlanMode && PLAN_MODE_BLOCKED_TOOLS.includes(toolName)) {
        console.error(`[runner] 🔒 PLAN MODE: Blocked ${toolName}`)
        return denyTool(`Tool "${toolName}" is not allowed in plan mode.`)
      }

      // Explicit deny list takes precedence
      if (disallowedTools.includes(toolName)) {
        console.error(`[runner] SECURITY: Blocked ${toolName}`)
        return denyTool(`Tool "${toolName}" is explicitly disallowed.`)
      }

      // Check allowed tools (SDK + internal MCP + OAuth MCP)
      if (baseAllowedTools.includes(toolName) || isOAuthMcpTool(toolName, connectedProviders)) {
        return allowTool(input)
      }

      // Tool not in any allowed list
      console.error(`[runner] SECURITY: Unauthorized ${toolName}`)
      return denyTool(`Tool "${toolName}" is not permitted.`)
    }

    // MCP tools use process.cwd() which is set by process.chdir() above
    // No workspace injection needed - tools default to process.cwd()

    // Get MCP servers with user-specific OAuth tokens
    // Uses registry from @webalive/shared - add new providers there
    const workspaceMcpServers = getMcpServers(targetCwd || process.cwd(), { oauthTokens })
    console.error("[runner] MCP servers enabled:", Object.keys(workspaceMcpServers).join(", "))

    // Log available secrets for debugging (without revealing values)
    console.error(`[runner] Internal tools secret: ${process.env.INTERNAL_TOOLS_SECRET ? "✓ present" : "✗ missing"}`)

    // Log resume parameters
    if (request.resumeSessionAt) {
      console.error(`[runner] Resuming at message: ${request.resumeSessionAt}`)
    }

    const agentQuery = query({
      prompt: request.message,
      options: {
        cwd: process.cwd(),
        model: request.model,
        maxTurns: request.maxTurns || DEFAULTS.CLAUDE_MAX_TURNS,
        permissionMode: effectivePermissionMode,
        ...(effectivePermissionMode === "bypassPermissions" ? { allowDangerouslySkipPermissions: true } : {}),
        allowedTools: effectiveAllowedTools, // Plan mode filters out modification tools
        disallowedTools, // Dynamic based on admin status
        canUseTool,
        settingSources: SETTINGS_SOURCES,
        mcpServers: workspaceMcpServers,
        systemPrompt: request.systemPrompt,
        // Session resumption: We use explicit session IDs for multi-conversation tracking
        resume: request.resume,
        // Resume at specific message (for message deletion/editing)
        resumeSessionAt: request.resumeSessionAt,
        // Alternative: continue: true - SDK auto-continues most recent conversation (no session ID needed)
        // continue: true,
      },
    })

    let messageCount = 0
    let queryResult = null

    for await (const message of agentQuery) {
      messageCount++

      if (message.type === "result") {
        queryResult = message
      }

      // Capture session ID from system init message
      if (message.type === "system" && message.subtype === "init" && message.session_id) {
        console.error(`[runner] Session ID captured: ${message.session_id}`)

        // Log MCP server status
        if (message.mcpServers) {
          console.error("[runner] MCP server status:", JSON.stringify(message.mcpServers, null, 2))
        }

        // Log available tools (including MCP tools)
        if (message.tools) {
          const mcpTools = message.tools.filter(t => t.startsWith("mcp__"))
          console.error(`[runner] Available MCP tools (${mcpTools.length}):`, mcpTools.join(", "))
        }

        process.stdout.write(
          `${JSON.stringify({
            type: STREAM_TYPES.SESSION,
            sessionId: message.session_id,
          })}\n`,
        )
      }

      // Filter system init message to only show allowed tools (base + connected OAuth MCP)
      let outputMessage = message
      if (message.type === "system" && message.subtype === "init" && message.tools) {
        outputMessage = {
          ...message,
          tools: message.tools.filter(
            tool => baseAllowedTools.includes(tool) || isOAuthMcpTool(tool, connectedProviders),
          ),
        }
      }

      process.stdout.write(
        `${JSON.stringify({
          type: STREAM_TYPES.MESSAGE,
          messageCount,
          messageType: message.type,
          content: outputMessage,
        })}\n`,
      )
    }

    process.stdout.write(
      `${JSON.stringify({
        type: STREAM_TYPES.COMPLETE,
        totalMessages: messageCount,
        result: queryResult,
      })}\n`,
    )

    console.error(`[runner] Success: ${messageCount} messages`)
  } catch (error) {
    console.error("[runner-error]", error?.stack || String(error))
    process.exit(1)
  }
})()
