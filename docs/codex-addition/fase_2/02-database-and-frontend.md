# Fase 2.2 — Database Schema & Frontend Changes

## Database Changes

### Workspace Settings: Add Provider

Current workspace settings are stored in Supabase. Need to add:

```sql
-- Add provider column to workspaces (or workspace_settings)
ALTER TABLE workspaces 
ADD COLUMN agent_provider TEXT NOT NULL DEFAULT 'claude'
CHECK (agent_provider IN ('claude', 'codex'));

-- Store provider-specific API keys per workspace
-- (separate from existing Anthropic OAuth)
ALTER TABLE workspaces
ADD COLUMN openai_api_key_encrypted TEXT;
```

Alternative: Store provider at the **conversation/stream** level (like Emdash) to allow mixing providers within one workspace:

```sql
ALTER TABLE streams
ADD COLUMN agent_provider TEXT NOT NULL DEFAULT 'claude'
CHECK (agent_provider IN ('claude', 'codex'));
```

**Recommendation**: Start with workspace-level provider. Simpler, covers 90% of use cases. Per-conversation provider can come later.

### API Key Storage

Options:
1. **Encrypted in DB** — workspace_settings.openai_api_key_encrypted
2. **Lockbox** — Alive already has a lockbox system for secrets
3. **Environment variable** — OPENAI_API_KEY on the server (single-tenant only)

For multi-tenant: use the lockbox pattern that already exists for Anthropic OAuth tokens.

```typescript
// Existing pattern in Alive:
// Workspace creator connects their Anthropic account via OAuth
// OAuth token stored in lockbox, passed to worker via IPC

// New pattern for Codex:
// Workspace creator enters their OpenAI API key in settings
// Key stored in lockbox, passed to worker via IPC as payload.apiKey
```

## Frontend Changes

### 1. Workspace Settings: Provider Selector

Add to workspace settings page:

```
┌─────────────────────────────────────────┐
│  Agent Provider                         │
│                                         │
│  ○ Claude (Anthropic)     [Connected ✓] │
│  ○ Codex (OpenAI)         [Add API Key] │
│                                         │
│  Model: [claude-opus-4  ▼]              │
│  (model dropdown filters by provider)   │
└─────────────────────────────────────────┘
```

### 2. Chat Input: Provider Indicator

Show which provider is active in the chat input area:

```
┌─────────────────────────────────────────┐
│  🟣 Claude │ Message...          [Send] │
└─────────────────────────────────────────┘

or

┌─────────────────────────────────────────┐
│  🟢 Codex  │ Message...          [Send] │
└─────────────────────────────────────────┘
```

### 3. Message Rendering: New Item Types

Codex introduces item types that don't exist in Claude's output:

#### `todo_list` — Agent's Plan
```
┌─────────────────────────────────────────┐
│  📋 Agent Plan                          │
│  ✅ Read the codebase structure         │
│  ✅ Identify the bug in auth.ts         │
│  ⬜ Write the fix                       │
│  ⬜ Run tests                           │
└─────────────────────────────────────────┘
```

#### `web_search` — Search Results
```
┌─────────────────────────────────────────┐
│  🔍 Searched: "react 19 breaking changes" │
└─────────────────────────────────────────┘
```

#### `file_change` — Structured Diff
```
┌─────────────────────────────────────────┐
│  📝 File Changes                        │
│  + src/auth.ts (update)                 │
│  + src/utils/validate.ts (add)          │
│  - src/old-auth.ts (delete)             │
└─────────────────────────────────────────┘
```

### 4. Message List: Provider Badge

Each message should show which provider generated it (subtle badge):

```
┌─ Claude ──────────────────────────────┐
│  I'll fix the bug in auth.ts...       │
└───────────────────────────────────────┘

┌─ Codex ───────────────────────────────┐
│  I found the issue. Here's my plan:   │
│  📋 [todo_list rendered here]         │
└───────────────────────────────────────┘
```

### 5. Model Selector

The model dropdown needs to filter by provider:

```typescript
const MODELS = {
  claude: [
    { id: "claude-opus-4", label: "Claude Opus 4" },
    { id: "claude-sonnet-4", label: "Claude Sonnet 4" },
  ],
  codex: [
    { id: "gpt-5.1", label: "GPT-5.1" },
    { id: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
    { id: "o3", label: "o3" },
  ],
}
```

## API Changes

### Stream Creation

```typescript
// POST /api/workspaces/:id/streams
{
  message: "Fix the bug in auth.ts",
  provider: "codex",  // NEW — optional, defaults to workspace setting
  model: "gpt-5.1",   // NEW — optional, defaults to provider default
}
```

### Workspace Settings Update

```typescript
// PATCH /api/workspaces/:id/settings
{
  agent_provider: "codex",
  openai_api_key: "sk-...",  // encrypted before storage
}
```

## Files to Change

### Backend
- `apps/web/src/app/api/workspaces/[id]/streams/route.ts` — pass provider to worker
- `packages/worker-pool/src/manager.ts` — pass provider in query payload
- `packages/worker-pool/src/worker-entry.mjs` — use provider registry
- `packages/database/` — add migration for provider columns

### Frontend
- `apps/web/src/components/workspace/settings.tsx` — provider selector
- `apps/web/src/components/chat/message-list.tsx` — provider badge
- `apps/web/src/components/chat/input.tsx` — provider indicator
- `apps/web/src/components/chat/items/` — new renderers for Codex item types
- `apps/web/src/lib/models.ts` — model catalog per provider
