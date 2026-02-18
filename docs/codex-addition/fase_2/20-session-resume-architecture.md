# Fase 2.20 — Session Resume Architecture

## Problem

Both providers support multi-turn conversations (resume). But they do it differently. Alive needs a unified session resume strategy.

## Claude Resume

Claude Agent SDK uses **session directories**:

```typescript
const result = query({
  sessionDir: "/var/lib/claude-sessions/workspace-abc",
  // ... session state is stored in this directory
  // Subsequent calls with same sessionDir auto-resume
});
```

Alive currently stores sessions at `SESSIONS_BASE_DIR + "/" + workspaceKey`. The session directory contains Claude's internal state (conversation history, tool results, etc.).

### Current worker-entry.mjs behavior:
```javascript
const SESSIONS_BASE_DIR = "/var/lib/claude-sessions";
// Session dir created per workspace, reused across queries
```

## Codex Resume

Codex uses **thread IDs**:

```typescript
const codex = new Codex({ apiKey: "..." });

// New thread:
const thread = codex.startThread({ workingDirectory: "/workspace" });
const { events } = await thread.runStreamed("Build a todo app");
// thread.id is now set (from thread.started event)

// Resume:
const resumed = codex.resumeThread(threadId, { workingDirectory: "/workspace" });
const { events: events2 } = await resumed.runStreamed("Add dark mode");
```

Thread state stored in `~/.codex/sessions/<thread_id>/`.

## Unified Session Model

```typescript
interface AgentSession {
  readonly sessionId: string | null;  // Provider-specific session identifier
  run(prompt: string): AsyncIterable<AgentEvent>;
  abort(): void;
}

// Provider creates session:
interface AgentProvider {
  createSession(config: SessionConfig): Promise<AgentSession>;
  resumeSession(sessionId: string, config: SessionConfig): Promise<AgentSession>;
}
```

### Storage Mapping

| Concept | Claude | Codex |
|---|---|---|
| Session identifier | Directory path | Thread ID string |
| State location | `sessionDir` on disk | `~/.codex/sessions/<id>/` |
| Resume mechanism | Same `sessionDir` | `resumeThread(id)` |
| What's stored | Full conversation + tool state | Full conversation + command history |

### Database Schema

The `workspace_sessions` table (or equivalent) needs:

```sql
ALTER TABLE workspace_sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude';
ALTER TABLE workspace_sessions ADD COLUMN provider_session_id TEXT;
-- For Claude: stores the session directory path
-- For Codex: stores the thread ID
```

### Key Design Decisions

1. **One active session per workspace** — don't support multiple concurrent providers in same workspace
2. **Provider switch = new session** — if user switches from Claude to Codex, start fresh (no cross-provider resume)
3. **Session cleanup on provider switch** — archive old session data, don't delete (user might switch back)
4. **Codex session directory isolation** — set `HOME` env var per workspace so `~/.codex/sessions/` doesn't leak across workspaces. Or use `XDG_CONFIG_HOME`/`XDG_DATA_HOME`.

### Codex Session Directory Isolation

Critical: Codex stores sessions in `~/.codex/sessions/`. If all workspaces share the same HOME, sessions could theoretically cross-contaminate.

Solution: Per-workspace Codex home:
```typescript
const codexEnv = {
  HOME: `/var/lib/codex-sessions/${workspaceKey}`,
  CODEX_API_KEY: apiKey,
  // ... other env vars
};

const codex = new Codex({ env: codexEnv, apiKey });
```

This isolates session storage per workspace. The `env` option in `CodexOptions` replaces `process.env` entirely, so we need to pass ALL required env vars.

### Migration

Existing workspaces have Claude sessions. On first query after multi-provider launch:
1. Check workspace provider setting
2. If still Claude → use existing session dir (no change)
3. If switched to Codex → create new Codex session, archive Claude session dir
