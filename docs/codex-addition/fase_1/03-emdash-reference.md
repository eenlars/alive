# Fase 1.3 — Emdash Reference Analysis

## What Emdash does
YC W26 company. "Run multiple coding agents in parallel." Provider-agnostic, supports 21 CLI agents.
Source: github.com/generalaction/emdash

## Their approach: CLI-first, no SDK
Emdash doesn't use provider SDKs at all. Every agent is a CLI binary spawned in a PTY.

Each provider is defined as a simple config object:
```typescript
type ProviderDefinition = {
  id: ProviderId
  name: string
  cli: string                    // binary name
  autoApproveFlag?: string       // e.g. "--full-auto", "--yolo"
  initialPromptFlag?: string     // how to pass first prompt
  useKeystrokeInjection?: boolean // some agents need keystroke input
  resumeFlag?: string            // how to resume a session
  defaultArgs?: string[]         // extra CLI args
  terminalOnly: true             // all agents are terminal-based
}
```

### Supported agents (21):
codex, claude, qwen, droid, gemini, cursor, copilot, amp, opencode, charm, auggie, goose, kimi, kilocode, kiro, rovo, cline, continue, codebuff, mistral, pi

### How they handle differences:
- **Auto-approve**: Each CLI has its own flag (`--full-auto`, `--yolo`, `--dangerously-skip-permissions`, etc.)
- **Prompt delivery**: Most via CLI flag, some via keystroke injection into the TUI
- **Resume**: Each CLI has its own resume mechanism
- **No MCP integration**: They don't manage MCP servers — each CLI handles its own tools

## Comparison: Emdash vs Alive's current approach

| Aspect | Emdash | Alive |
|--------|--------|-------|
| **Integration** | CLI spawn in PTY | SDK in-process |
| **Streaming** | Terminal output scraping | Structured event stream |
| **Tool control** | None (CLI handles it) | Fine-grained (allowedTools, canUseTool) |
| **MCP** | None | Full MCP server management |
| **Permissions** | CLI flags | SDK permission callbacks |
| **Session** | CLI resume flags | SDK session management |
| **Isolation** | Git worktrees | UID/GID privilege drop |

## Key Insight: Two possible paths for Alive

### Path A: Emdash-style (CLI wrapper)
- Spawn Codex CLI in a PTY alongside Claude CLI
- Simple, fast to implement
- Lose: fine-grained tool control, MCP integration, structured events
- Gain: instant support for 21+ agents

### Path B: SDK integration (current approach extended)
- Use `@openai/codex-sdk` alongside `@anthropic-ai/claude-agent-sdk`
- More work, but keep structured events and tool control
- Each new provider needs its own SDK adapter
- Gain: rich integration, MCP support, tool permissions

### Path C: Hybrid
- Use SDK for providers that have one (Claude, Codex)
- Fall back to CLI/PTY for providers that don't
- Best of both worlds but most complex

## Recommendation (preliminary)
**Start with Path B for Claude + Codex (the two that matter most), but design the provider interface so Path A can be added later for other agents.**

This means:
1. Create an `AgentProvider` interface
2. `ClaudeProvider` wraps current SDK integration
3. `CodexProvider` wraps Codex SDK
4. Later: `CliProvider` wraps any CLI (Emdash-style) for agents without SDKs

## Deep Dive: How Emdash Actually Works

### PTY Manager (`src/main/services/ptyManager.ts`)
Two spawn modes:

**1. `startDirectPty()`** — Direct CLI spawn (fast, no shell config)
- Resolves CLI binary path from `providerStatusCache`
- Builds args from provider config (resumeFlag, defaultArgs, autoApproveFlag, initialPromptFlag)
- Spawns via `node-pty` with minimal env (only auth vars like OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
- When CLI exits, spawns a shell so user can keep working

**2. `startPty()`** — Shell-wrapped spawn (loads user shell config)
- Spawns user's shell with `-lic "provider_command; exec shell -il"`
- Provider command built from same config flags
- Falls back to plain shell if spawn fails
- Supports keystroke injection for agents that can't take prompt via CLI flag

### Auth: Simple env var passthrough
```python
AGENT_ENV_VARS = [
  'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY',
  'CURSOR_API_KEY', 'GITHUB_TOKEN', ...
]
```
Just passes through whatever's in the process environment. No OAuth, no credential management.

### Database Schema (`src/main/db/schema.ts`)
Key tables:
- `projects` — repo path, git info, optional SSH connection
- `tasks` — linked to project, has branch, worktree path, status, agentId
- `conversations` — linked to task, **has `provider` column** (claude, codex, qwen, etc.)
- `messages` — linked to conversation
- `lineComments` — code review comments linked to tasks

**Key insight:** Provider is stored per CONVERSATION, not per project or task. One task can have multiple conversations with different providers.

### Task Lifecycle (`src/main/services/TaskLifecycleService.ts`)
- Setup → Run → Teardown lifecycle per task
- Each task gets its own git worktree
- Tasks track status: idle, running, etc.
- Process tree management for clean kills

### Terminal Output Parsing (`src/main/services/TerminalSnapshotService.ts` + `TerminalConfigParser.ts`)
They scrape terminal output to understand what the agent is doing. No structured events — pure terminal parsing.

## What Alive Can Learn From Emdash

1. **Provider registry pattern is clean** — simple config objects, easy to add new providers
2. **Provider per conversation** is smart — allows mixing agents in one project
3. **Direct spawn mode** — skip shell config for faster startup
4. **Auth via env vars** — simple, works, no OAuth complexity for CLI agents
5. **Git worktrees** — clean isolation per task

## What Alive Does Better

1. **Structured events** — Alive gets typed messages from Claude SDK, not terminal scraping
2. **Tool control** — fine-grained permissions, MCP servers, custom tools
3. **Web-native** — no desktop app needed
4. **Persistent agents** — keep running after tab close
5. **Multi-tenant** — UID/GID isolation, not just git worktrees

## Updated Recommendation

Path C (Hybrid) might actually be best:
1. **ClaudeProvider** — keep current SDK integration (rich events, tool control, MCP)
2. **CodexProvider** — use Codex TypeScript SDK (structured events, thread sessions)
3. **GenericCliProvider** — Emdash-style PTY spawn for any other CLI agent

The provider interface needs to handle both structured event streams AND raw terminal output.
Conversations table already shows how to store provider per chat — Alive needs similar.
