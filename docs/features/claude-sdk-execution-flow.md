# Claude SDK Execution Flow

Complete flow from frontend chat message to actual file edits on the website.

## Overview

When a user sends a message in the chat UI, it flows through several layers of authentication, authorization, and privilege separation before Claude can execute tools like `Edit`, `Write`, or `Read` on the user's website files.

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
│                                                                             │
│  User types message → sendMessage() → fetch("/api/claude/stream")           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          API ROUTE (Next.js)                                 │
│                     apps/web/app/api/claude/stream/route.ts                  │
│                                                                             │
│  1. hasSessionCookie() ─────────── verify JWT cookie exists                 │
│  2. requireSessionUser() ───────── decode JWT → user ID, email, isAdmin     │
│  3. verifyWorkspaceAccess() ────── check workspace in JWT's workspaces[]    │
│  4. resolveWorkspace() ─────────── hostname → /srv/webalive/sites/{domain}  │
│  5. tryLockConversation() ──────── prevent concurrent requests              │
│  6. getAllowedTools() ──────────── determine permitted tools                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PRIVILEGE SEPARATION                                    │
│                                                                             │
│  Option A: Worker Pool (WORKER_POOL.ENABLED)                                │
│  ├── pool.query(credentials, payload)                                       │
│  └── Worker runs as workspace user UID/GID                                  │
│                                                                             │
│  Option B: Child Process (legacy)                                           │
│  ├── spawn(run-agent.mjs, { TARGET_UID, TARGET_GID, TARGET_CWD })          │
│  └── Child drops privileges before SDK runs                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CHILD PROCESS (run-agent.mjs)                           │
│                     apps/web/scripts/run-agent.mjs                           │
│                                                                             │
│  // PRIVILEGE DROP - CRITICAL SECURITY BOUNDARY                             │
│  process.setgid(targetGid)  // e.g., site-example-com group                 │
│  process.setuid(targetUid)  // e.g., site-example-com user                  │
│  process.chdir(targetCwd)   // e.g., /srv/webalive/sites/example.com/user   │
│                                                                             │
│  // NOW safe to run Claude SDK                                              │
│  query({                                                                    │
│    prompt: message,                                                         │
│    options: { cwd, allowedTools, canUseTool, mcpServers }                   │
│  })                                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLAUDE SDK EXECUTION                                 │
│                                                                             │
│  Claude decides to use Edit tool                                            │
│       │                                                                     │
│       ▼                                                                     │
│  canUseTool("Edit", input) ─────── permission check                         │
│       │                                                                     │
│       ▼ (allowed)                                                           │
│  Edit tool writes file to filesystem                                        │
│       │                                                                     │
│       ▼                                                                     │
│  File created with site-example-com:site-example-com ownership              │
│  (because process runs as that user)                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         STREAM RESPONSE                                      │
│                                                                             │
│  SDK yields messages → NDJSON format → child stdout                         │
│       │                                                                     │
│       ▼                                                                     │
│  Parent reads stream → wraps in BridgeMessage envelope                      │
│       │                                                                     │
│       ▼                                                                     │
│  HTTP Response (Content-Type: application/x-ndjson)                         │
│       │                                                                     │
│       ▼                                                                     │
│  Frontend parses NDJSON lines → updates UI                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/app/chat/page.tsx` | Frontend chat UI, sends messages |
| `apps/web/app/api/claude/stream/route.ts` | API route, auth, orchestration |
| `apps/web/features/auth/lib/auth.ts` | JWT verification, workspace access |
| `apps/web/lib/claude/agent-constants.mjs` | Tool configuration |
| `packages/shared/src/stream-tools.ts` | Tool whitelist source of truth |
| `apps/web/lib/workspace-execution/agent-child-runner.ts` | Child process spawning |
| `apps/web/scripts/run-agent.mjs` | Claude SDK execution with privilege drop |
| `packages/tools/src/mcp-server.ts` | Custom MCP tools |

## Tool Permissions

### Allowed SDK Tools (all users)

```typescript
[
  "Read", "Write", "Edit", "Glob", "Grep",      // File operations
  "ExitPlanMode", "TodoWrite",                   // Planning/workflow
  "ListMcpResources", "Mcp", "ReadMcpResource", // MCP integration
  "NotebookEdit", "WebFetch", "AskUserQuestion" // Other
]
```

### Admin-Only Tools

```typescript
["Bash", "BashOutput", "TaskStop"]
```

Only users with emails in the hardcoded `ADMIN_EMAILS` list get these tools.

### Always Blocked

```typescript
["Task", "WebSearch"]
```

### OAuth MCP Tools

Users who connect OAuth providers (Stripe, Linear, etc.) automatically get access to those provider's tools. Checked dynamically in `canUseTool` callback.

## Permission Enforcement

The `canUseTool` callback runs for every tool invocation:

```javascript
const canUseTool = async (toolName, input) => {
  // 1. Check explicit deny list (highest priority)
  if (disallowedTools.includes(toolName)) {
    return { behavior: "deny", message: "Tool not available" }
  }

  // 2. Check base allowed list (SDK + internal MCP tools)
  if (baseAllowedTools.includes(toolName)) {
    return { behavior: "allow" }
  }

  // 3. Check OAuth MCP tools (dynamic based on user's connections)
  if (isOAuthMcpTool(toolName, connectedProviders)) {
    return { behavior: "allow" }
  }

  // 4. Default deny
  return { behavior: "deny", message: "Tool not permitted" }
}
```

## Security Layers

| Layer | Mechanism | Location |
|-------|-----------|----------|
| **Authentication** | JWT cookie with user ID, email, workspaces | `auth.ts` |
| **Authorization** | Workspace must be in JWT's workspaces array | `verifyWorkspaceAccess()` |
| **Workspace Isolation** | Each site = dedicated system user | systemd service |
| **File Ownership** | Child drops to site user before SDK runs | `run-agent.mjs` |
| **Tool Whitelist** | `allowedTools` + `canUseTool` callback | `stream-tools.ts` |
| **Path Enforcement** | SDK runs in workspace cwd, can't escape | `process.chdir()` |
| **Concurrent Request Lock** | One request per conversation at a time | `tryLockConversation()` |

## Internal MCP Servers

Two custom MCP servers provide additional tools:

### alive-tools

```typescript
// Tools for Claude's context
- search_tools        // Find available tools
- get_workflow        // Load task-specific guides
- list_workflows      // List available workflows
- debug_workspace     // Analyze logs + suggest fixes
- get_alive_super_template
- read_server_logs
- generate_persona
```

### alive-workspace

```typescript
// Workspace management tools
- restart_dev_server  // Restart site's systemd service
- install_package     // Run bun install in workspace
- check_codebase      // Run TypeScript/ESLint checks
- delete_file         // Delete files (with protections)
- switch_serve_mode   // Toggle dev/build mode
- copy_shared_asset   // Copy from shared assets library
```

## Streaming Protocol

Messages flow as NDJSON (Newline-Delimited JSON):

```typescript
// Event types
type BridgeStreamType =
  | "stream_start"     // Stream initialization
  | "stream_session"   // Session ID for resumption
  | "stream_message"   // SDK message wrapper
  | "stream_complete"  // Successful completion
  | "stream_error"     // Error with code
  | "stream_ping"      // Keepalive
  | "stream_done"      // Clean end
  | "stream_interrupt" // User cancelled
```

Each line is a complete JSON object:

```json
{"type":"stream_message","requestId":"abc123","timestamp":"...","data":{...}}
{"type":"stream_complete","requestId":"abc123","timestamp":"...","data":{...}}
```

## See Also

- [Architecture: Workspace Isolation](../architecture/workspace-isolation.md)
- [Security: Workspace Enforcement](../security/workspace-enforcement.md)
- [Architecture: Session Management](../architecture/session-management.md)
