# Alive Agents

## Why This Matters

This replaces the current chat system. Not "new feature" - this IS the product.

Current system problems:
- Browser close = agent dies (HTTP connection held open)
- Server restart = all state lost (4 in-memory systems)
- 500-line route handler with callback spaghetti
- Can't do sub-agents (the whole CoC vision depends on this)

This isn't optional. The current architecture blocks the product roadmap.

## The Actual Solution

Agent runs in background process. State in DB. User can leave, come back, agent still working (or finished).

## Delete These Requirements

~~**Profiles table**~~ - Inline config. Users don't need templates yet. If they do, they can save JSON locally.

~~**Sub-agents**~~ - Cool but scope creep. V2.

~~**Pause/resume**~~ - Complex. Just stop. User can re-run with adjusted prompt.

~~**Token tracking in our DB**~~ - SDK returns this in result message. Don't duplicate.

~~**Turn tracking**~~ - Same. SDK tracks this.

~~**Workspace scoping**~~ - Inherit from existing auth. Don't rebuild.

~~**Multiple concurrent agents per user**~~ - Start with 1. Add limit later if needed.

## What's Left

### DB Schema

```sql
CREATE TABLE app.agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  task TEXT NOT NULL,
  config JSONB DEFAULT '{}',   -- tools, model, systemPrompt, etc.
  status TEXT DEFAULT 'running',  -- running, completed, failed, stopped
  session_id TEXT,              -- SDK session for resume
  error TEXT,                   -- if failed
  result TEXT,                  -- final output if completed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE app.agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES app.agent_runs(id) ON DELETE CASCADE,
  seq SERIAL,                   -- monotonic for reconnect
  content JSONB NOT NULL,       -- raw SDK message
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_agent_messages_seq ON app.agent_messages(run_id, seq);
```

That's it. Two tables. No profiles. No hierarchy. No tokens.

### API

```
POST /api/agents        { task, config? }     → { id }
GET  /api/agents/:id                          → { status, messages[], result?, error? }
GET  /api/agents/:id/stream?after=N           → SSE
POST /api/agents/:id/stop                     → { status: 'stopped' }
```

Four endpoints. Not six. Not twelve.

### streamAI()

```typescript
async function* streamAI(task: string, config: AgentConfig) {
  const q = query({
    prompt: task,
    options: {
      model: config.model ?? 'claude-sonnet-4-20250514',
      maxTurns: config.maxTurns ?? 50,
      tools: config.tools ?? ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
      systemPrompt: config.systemPrompt,
      permissionMode: 'bypassPermissions',
    }
  })

  for await (const msg of q) {
    yield msg
  }
}
```

10 lines. Uses existing SDK. No wrapper on wrapper.

### Runner

```typescript
async function runAgent(runId: string) {
  const run = await db.agent_runs.get(runId)
  let lastSessionId: string | undefined

  try {
    for await (const msg of streamAI(run.task, run.config)) {
      // Capture session ID
      if (msg.type === 'system' && msg.subtype === 'init') {
        lastSessionId = msg.session_id
        await db.agent_runs.update(runId, { session_id: msg.session_id })
      }

      // Store message
      const seq = await db.agent_messages.insert(runId, msg)

      // Broadcast to connected clients
      broadcast(runId, { seq, ...msg })

      // Check for stop request
      const current = await db.agent_runs.get(runId)
      if (current.status === 'stopped') break

      // Capture result
      if (msg.type === 'result') {
        await db.agent_runs.update(runId, {
          status: 'completed',
          result: msg.result
        })
      }
    }
  } catch (err) {
    await db.agent_runs.update(runId, {
      status: 'failed',
      error: err.message
    })
  }
}
```

30 lines. No callbacks. No registry. No cleanup intervals.

### Frontend

```typescript
// Start agent
const { id } = await fetch('/api/agents', {
  method: 'POST',
  body: JSON.stringify({ task: 'Fix the login bug' })
}).then(r => r.json())

// Watch it
let lastSeq = 0
const es = new EventSource(`/api/agents/${id}/stream?after=${lastSeq}`)
es.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  lastSeq = msg.seq
  render(msg)
}

// Reconnect on error
es.onerror = () => {
  es.close()
  setTimeout(() => {
    es = new EventSource(`/api/agents/${id}/stream?after=${lastSeq}`)
  }, 1000)
}

// Or just fetch current state
const { status, messages, result } = await fetch(`/api/agents/${id}`).then(r => r.json())
```

That's the entire frontend integration.

## Questions That Don't Matter Yet

- "What about sub-agents?" - V2.
- "What about profiles?" - Save JSON yourself.
- "What about pause?" - Stop and re-run.
- "What about concurrent agents?" - Start with 1, measure, then decide.
- "What about billing?" - SDK gives us tokens in result. Charge after.
- "What if server crashes?" - On restart, query `status='running'`, mark as failed. User re-runs. Simple.

## What Goes Away

| Before | After |
|--------|-------|
| 500-line route handler | 30-line runner |
| In-memory conversation locks | DB status field |
| Cancellation registry + callbacks | DB status field |
| Redis stream buffer | DB messages table |
| Session cache with TTL | SDK handles sessions |
| 4 cleanup intervals | 0 |

## Implementation

1. Create tables (10 min)
2. Write `streamAI()` (10 min - it's 10 lines)
3. Write runner (30 min)
4. Write 4 API endpoints (1 hour)
5. Wire up SSE broadcast (30 min)
6. Frontend hook (30 min)

Total: ~3 hours for a working system.

## Phase 2: Sub-Agents (The CoC Vision)

Once V1 is solid, add sub-agent MCP tools:

```typescript
spawn_agent({ task }) → { agentId }
check_agent({ agentId }) → { status, result?, lastOutput? }
stop_agent({ agentId }) → { status: 'stopped' }
```

This enables the core game mechanic: deploy agents like troops, watch them work, coordinate multiple agents on complex tasks.

Schema addition for Phase 2:
```sql
ALTER TABLE app.agent_runs ADD COLUMN parent_id UUID REFERENCES app.agent_runs(id);
```

That's it. One column. The architecture supports it from day 1.

## Phase 3: Agent Customization

- Profiles (saved configs)
- Pause/resume
- Token budgets per agent
- Agent "personalities" via system prompts

## Migration Path

This replaces `/api/claude/stream`. Not alongside it - replaces it.

1. Build new system
2. Feature flag to route traffic
3. Migrate existing conversations (or don't - they're ephemeral anyway)
4. Delete old code (the 500-line handler, 4 in-memory systems, Redis buffer)
