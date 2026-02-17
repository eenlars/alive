# Fase 2.1 — AgentProvider Abstraction Layer

## Overview

The AgentProvider interface is the central abstraction that makes multi-provider support possible. It sits between Alive's worker IPC layer and the provider-specific SDKs.

```
┌─────────────────────────────────────────────────┐
│  Worker Entry (worker-entry.mjs)                │
│  IPC, privilege drop, env isolation             │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  AgentProvider Interface                │    │
│  │                                         │    │
│  │  ┌──────────┐  ┌──────────┐            │    │
│  │  │ Claude   │  │ Codex    │  (future)  │    │
│  │  │ Provider │  │ Provider │            │    │
│  │  └──────────┘  └──────────┘            │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  MCP Servers (standalone processes)             │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐     │
│  │ workspace  │ │  tools   │ │  email   │     │
│  └────────────┘ └──────────┘ └──────────┘     │
└─────────────────────────────────────────────────┘
```

## Interface Definition

```typescript
// packages/worker-pool/src/providers/types.ts

export interface AgentProviderConfig {
  /** Provider identifier */
  provider: "claude" | "codex"
  
  /** User prompt */
  prompt: string
  
  /** Working directory (already chdir'd) */
  cwd: string
  
  /** Model to use (provider-specific model name) */
  model?: string
  
  /** Maximum agent turns */
  maxTurns?: number
  
  /** Session to resume */
  resumeSessionId?: string
  
  /** Abort signal */
  signal: AbortSignal
  
  /** System prompt override */
  systemPrompt?: string
  
  /** MCP server definitions (provider-agnostic format) */
  mcpServers: McpServerDef[]
  
  /** Permission mode */
  permissionMode: "bypassPermissions" | "plan" | "normal"
  
  /** Allowed tool names */
  allowedTools: string[]
  
  /** Disallowed tool names */
  disallowedTools: string[]
  
  /** Provider-specific API key */
  apiKey?: string
  
  /** Extra configuration (provider-specific) */
  extra?: Record<string, unknown>
}

export interface McpServerDef {
  /** Server name */
  name: string
  /** Stdio: command + args to spawn */
  command?: string[]
  /** Stdio: environment variables */
  env?: Record<string, string>
  /** HTTP: URL */
  url?: string
  /** HTTP: bearer token */
  bearerToken?: string
}

export interface AgentEvent {
  type: "session" | "message" | "complete" | "error"
  sessionId?: string
  content?: AgentMessageContent
  result?: AgentResult
  error?: string
  diagnostics?: unknown
}

export interface AgentMessageContent {
  /** Original provider message — passed through for frontend rendering */
  raw: unknown
  /** Normalized type for provider-agnostic logic */
  kind: "text" | "tool_use" | "tool_result" | "thinking" | "system_init"
}

export interface AgentResult {
  success: boolean
  usage?: { inputTokens: number; outputTokens: number; cachedTokens?: number }
  errors?: string[]
}

export interface AgentProvider {
  readonly name: string
  
  /**
   * Run a query and yield normalized events.
   * The provider maps its native SDK events to AgentEvent.
   */
  query(config: AgentProviderConfig): AsyncIterable<AgentEvent>
  
  /**
   * Clean up resources (if any).
   */
  dispose?(): Promise<void>
}
```

## Provider Registry

```typescript
// packages/worker-pool/src/providers/registry.ts

const providers = new Map<string, AgentProvider>()

export function registerProvider(provider: AgentProvider): void {
  providers.set(provider.name, provider)
}

export function getProvider(name: string): AgentProvider {
  const p = providers.get(name)
  if (!p) throw new Error(`Unknown provider: ${name}`)
  return p
}

// On worker startup:
registerProvider(new ClaudeProvider())
registerProvider(new CodexProvider())
```

## ClaudeProvider Implementation Sketch

```typescript
// packages/worker-pool/src/providers/claude-provider.ts

import { query } from "@anthropic-ai/claude-agent-sdk"

export class ClaudeProvider implements AgentProvider {
  readonly name = "claude"
  
  async *query(config: AgentProviderConfig): AsyncIterable<AgentEvent> {
    // Map AgentProviderConfig → Claude SDK query() options
    const claudeOpts = {
      prompt: config.prompt,
      options: {
        cwd: config.cwd,
        model: config.model,
        maxTurns: config.maxTurns,
        permissionMode: config.permissionMode,
        allowedTools: config.allowedTools,
        canUseTool: buildCanUseTool(config),
        settingSources: [],
        mcpServers: mapMcpServersForClaude(config.mcpServers),
        systemPrompt: config.systemPrompt,
        resume: config.resumeSessionId,
        abortSignal: config.signal,
      }
    }
    
    // Stream Claude SDK messages and map to AgentEvent
    for await (const msg of query(claudeOpts)) {
      yield mapClaudeMessage(msg)
    }
  }
}

function mapClaudeMessage(msg: any): AgentEvent {
  if (msg.type === "system" && msg.subtype === "init") {
    return { type: "session", sessionId: msg.sessionId, content: { raw: msg, kind: "system_init" } }
  }
  if (msg.type === "result") {
    return {
      type: "complete",
      result: {
        success: msg.subtype === "success",
        errors: msg.errors,
      }
    }
  }
  return { type: "message", content: { raw: msg, kind: classifyClaudeMsg(msg) } }
}
```

## CodexProvider Implementation Sketch

```typescript
// packages/worker-pool/src/providers/codex-provider.ts

import { Codex } from "@openai/codex-sdk"

export class CodexProvider implements AgentProvider {
  readonly name = "codex"
  private codex: Codex
  
  constructor() {
    // Codex instance can be reused across queries (manages CLI lifecycle)
  }
  
  async *query(config: AgentProviderConfig): AsyncIterable<AgentEvent> {
    this.codex = new Codex({
      apiKey: config.apiKey,
      config: {
        mcp_servers: mapMcpServersForCodex(config.mcpServers),
      },
      env: buildCodexEnv(config),
    })
    
    const thread = this.codex.startThread({
      model: config.model,
      workingDirectory: config.cwd,
      skipGitRepoCheck: true,
      sandboxMode: mapPermissionToSandbox(config.permissionMode),
      approvalPolicy: mapPermissionToApproval(config.permissionMode),
    })
    
    // Emit session event
    // Note: thread_id comes from thread.started event
    
    const { events } = await thread.runStreamed(config.prompt, {
      signal: config.signal,
    })
    
    for await (const event of events) {
      yield mapCodexEvent(event)
    }
  }
}

function mapPermissionToSandbox(mode: string): SandboxMode {
  if (mode === "bypassPermissions") return "danger-full-access"
  if (mode === "plan") return "read-only"
  return "workspace-write"
}

function mapPermissionToApproval(mode: string): ApprovalMode {
  if (mode === "bypassPermissions") return "never"  // auto-approve
  return "untrusted"
}

function mapCodexEvent(event: ThreadEvent): AgentEvent {
  switch (event.type) {
    case "thread.started":
      return { type: "session", sessionId: event.thread_id }
    case "turn.completed":
      return {
        type: "complete",
        result: {
          success: true,
          usage: {
            inputTokens: event.usage.input_tokens,
            outputTokens: event.usage.output_tokens,
            cachedTokens: event.usage.cached_input_tokens,
          }
        }
      }
    case "turn.failed":
      return { type: "error", error: event.error.message }
    case "error":
      return { type: "error", error: event.message }
    case "item.started":
    case "item.updated":
    case "item.completed":
      return { type: "message", content: { raw: event, kind: mapItemKind(event.item) } }
    default:
      return { type: "message", content: { raw: event, kind: "text" } }
  }
}
```

## Worker Entry Changes

The worker-entry.mjs `handleQuery()` function changes from directly calling `query()` to:

```javascript
// Before:
for await (const msg of query({ prompt, options })) { ... }

// After:
const provider = getProvider(payload.provider || "claude")
for await (const event of provider.query(providerConfig)) {
  // Map AgentEvent to IPC message (same format as before)
  ipc.send(mapEventToIpc(event, requestId, streamTypes))
}
```

## File Structure

```
packages/worker-pool/src/
├── providers/
│   ├── types.ts              # AgentProvider interface + types
│   ├── registry.ts           # Provider registry
│   ├── claude-provider.ts    # Claude SDK adapter
│   ├── codex-provider.ts     # Codex SDK adapter
│   └── mcp-utils.ts          # MCP server config mapping utilities
├── worker-entry.mjs          # Modified to use provider registry
├── manager.ts                # No changes needed (provider-agnostic)
└── types.ts                  # Existing types (mostly unchanged)
```

## Migration Path

1. **Phase A**: Extract current Claude logic from `handleQuery()` into `ClaudeProvider` — zero behavior change
2. **Phase B**: Add provider selection to IPC payload (`payload.provider = "claude" | "codex"`)
3. **Phase C**: Implement `CodexProvider`
4. **Phase D**: Refactor MCP servers to standalone processes
5. **Phase E**: Wire frontend provider selector to payload

Each phase can be shipped independently. Phase A is pure refactor — safest to start with.
