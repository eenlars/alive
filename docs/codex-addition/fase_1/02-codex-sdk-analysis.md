# Fase 1.2 — Codex SDK Analysis

## Codex TypeScript SDK (`@openai/codex-sdk`)

Package: `@openai/codex-sdk` (wraps `@openai/codex` CLI via JSONL over stdin/stdout)
Source: `github.com/openai/codex/sdk/typescript`
Requires: Node.js 18+, `@openai/codex` CLI installed

### API Surface

```typescript
import { Codex } from "@openai/codex-sdk"

const codex = new Codex({
  env: { ... },        // control CLI environment
  config: { ... },     // --config overrides (TOML)
})

// Start a thread (= session)
const thread = codex.startThread({
  workingDirectory: "/path/to/project",
  skipGitRepoCheck: true,  // useful for non-git workspaces
})

// Run a query (buffered)
const turn = await thread.run("prompt", { outputSchema? })
// turn.finalResponse — text response
// turn.items — all items (tool calls, responses, etc.)

// Run streamed (async generator)
const { events } = await thread.runStreamed("prompt")
for await (const event of events) {
  // event.type: "item.completed" | "turn.completed" | ...
}

// Resume existing thread
const thread = codex.resumeThread(threadId)
```

### Key Differences: Claude SDK vs Codex SDK

| Feature | Claude (`@anthropic-ai/claude-agent-sdk`) | Codex (`@openai/codex-sdk`) |
|---------|-------------------------------------------|----------------------------|
| **Import** | `import { query } from "..."` | `import { Codex } from "..."` |
| **Query pattern** | `query({ prompt, options })` → async iterator | `thread.run(prompt)` or `thread.runStreamed(prompt)` → async iterator |
| **Session** | Resume via session ID string | Thread object, resume via `resumeThread(id)` |
| **Streaming** | Direct async iterator of messages | `runStreamed()` returns `{ events }` async generator |
| **Message format** | `{ type: "system"\|"assistant"\|"tool_use"\|"result", subtype? }` | `{ type: "item.completed"\|"turn.completed", item?, usage? }` |
| **MCP** | Built-in MCP server support in options | Unknown — needs investigation |
| **Tools** | `allowedTools`, `disallowedTools`, `canUseTool` callback | Unknown — CLI handles tools internally? |
| **Permissions** | `permissionMode` ("bypassPermissions", etc.) | `--full-auto`, `--yolo` flags on CLI |
| **Working dir** | Set via `cwd` in options + process.chdir | `workingDirectory` in thread options |
| **Auth** | CLAUDE_CONFIG_DIR, OAuth | OPENAI_API_KEY or ChatGPT login |
| **Process model** | SDK runs in-process | SDK spawns CLI as child process (JSONL IPC) |

### Critical Difference: Process Model

- **Claude**: `query()` runs the agent in-process. The SDK IS the agent.
- **Codex**: SDK spawns the `codex` CLI as a child process and communicates via JSONL. The CLI is the agent.

This means:
1. Codex CLI must be installed on the server (`npm i -g @openai/codex`)
2. Each Codex query spawns a new process (or reuses a thread)
3. Privilege dropping works differently — the CLI process needs access to the workspace
4. MCP/tool handling is done inside the CLI, not controllable from outside (unless Codex supports MCP config)

### MCP Support in Codex — TODO
Need to check:
- Does Codex support MCP servers?
- Can we pass MCP config to Codex SDK/CLI?
- How does Codex handle custom tools?

### Auth in Codex
- `OPENAI_API_KEY` env var (API key mode)
- ChatGPT login (consumer mode — not suitable for server)
- SDK injects `OPENAI_BASE_URL` and `CODEX_API_KEY` automatically

For Alive: users would need to provide their own OpenAI API key, similar to how they currently use Anthropic OAuth.

### Session Persistence
- Codex stores sessions in `~/.codex/sessions`
- Can resume via `resumeThread(threadId)`
- Alive's per-workspace HOME setup (`/var/lib/claude-sessions/<workspace>/`) would work for Codex too

## Abstraction Design (initial thoughts)

The abstraction needs to normalize:
1. **Query interface**: Both take a prompt, return a stream of events
2. **Event format**: Map both to Alive's stream types (SESSION, MESSAGE, COMPLETE, ERROR)
3. **Session management**: Both support resume
4. **Working directory**: Both support cwd
5. **Auth**: Different env vars per provider
6. **Tool permissions**: Claude has fine-grained control, Codex uses CLI modes

### Proposed interface:

```typescript
interface AgentProvider {
  name: string  // "claude" | "codex"
  
  query(options: {
    prompt: string
    cwd: string
    model?: string
    maxTurns?: number
    resume?: string
    abortSignal?: AbortSignal
    systemPrompt?: string
    mcpServers?: Record<string, McpServerConfig>
    permissionMode?: string
    allowedTools?: string[]
  }): AsyncIterable<AgentEvent>
}

interface AgentEvent {
  type: "session" | "message" | "complete" | "error"
  sessionId?: string
  content?: unknown
  result?: unknown
  error?: string
}
```

Each provider (ClaudeProvider, CodexProvider) implements this interface and maps native events to AgentEvent.

## Next Steps
- [ ] Check Codex MCP support
- [ ] Check Codex tool permission model
- [ ] Map event types between Claude and Codex
- [ ] Design the provider registry (how frontend selects provider)
- [ ] Design credential management per provider
