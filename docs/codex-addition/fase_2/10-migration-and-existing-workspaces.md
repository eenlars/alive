# Fase 2.10 — Migration Path for Existing Workspaces

## Problem

Existing workspaces are all Claude-only. We need to:
1. Add the `agent_provider` column without breaking anything
2. Migrate MCP servers from in-process to standalone without downtime
3. Handle sessions that were started with Claude but workspace now switches to Codex
4. Ensure rollback is possible at every step

## Database Migration

### Migration 1: Add provider column

```sql
-- Safe: adds column with default, no existing data changes
ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS agent_provider TEXT NOT NULL DEFAULT 'claude';

-- Add check constraint separately (safer for large tables)
ALTER TABLE workspaces 
ADD CONSTRAINT valid_provider CHECK (agent_provider IN ('claude', 'codex'));
```

### Migration 2: Add API key storage

```sql
-- Nullable — only set when user configures Codex
ALTER TABLE workspaces 
ADD COLUMN IF NOT EXISTS openai_api_key_encrypted TEXT;
```

### Migration 3: Add provider to streams (future, per-conversation provider)

```sql
-- NOT in v1. Reserved for future use.
-- ALTER TABLE streams ADD COLUMN agent_provider TEXT;
```

### Rollback:
```sql
ALTER TABLE workspaces DROP CONSTRAINT IF EXISTS valid_provider;
ALTER TABLE workspaces DROP COLUMN IF EXISTS agent_provider;
ALTER TABLE workspaces DROP COLUMN IF EXISTS openai_api_key_encrypted;
```

## MCP Server Migration (Zero-Downtime)

This is the riskiest change. Plan:

### Phase 1: Build standalone MCP servers alongside existing ones
- New package: `packages/mcp-servers/`
- Existing `createSdkMcpServer` in `packages/tools/src/mcp-server.ts` stays untouched
- Both co-exist

### Phase 2: Feature flag toggle
```env
USE_STANDALONE_MCP=false   # default: use existing in-process (Claude only)
USE_STANDALONE_MCP=true    # new: use standalone stdio servers (multi-provider)
```

Worker-entry logic:
```javascript
const useStandaloneMcp = process.env.USE_STANDALONE_MCP === "true"

if (useStandaloneMcp) {
  // Pass command specs to provider SDK
  mcpServers = buildStandaloneSpecs(payload)
} else {
  // Use existing createSdkMcpServer objects (Claude only)
  mcpServers = { ...workspaceInternalMcp, ...toolsInternalMcp, ...optionalMcpServers }
}
```

### Phase 3: Test with `USE_STANDALONE_MCP=true` on staging
- Verify all 18 tools work via stdio
- Compare tool call latency (expect +1-5ms per call)
- Run for 24h minimum

### Phase 4: Enable in production
- Set `USE_STANDALONE_MCP=true`
- Monitor for errors
- Keep old code for 1 week as fallback

### Phase 5: Remove old code
- Delete `createSdkMcpServer` usage from `packages/tools/src/mcp-server.ts`
- Remove feature flag check
- Clean up imports

## Session Continuity

### Scenario: User switches workspace from Claude to Codex

**Problem:** Existing streams have Claude sessions (session IDs stored in `/var/lib/claude-sessions/`). Codex can't resume Claude sessions and vice versa.

**Solution:** 
- Switching provider starts a NEW session for the next query
- Previous messages are still visible in the stream (they're stored in DB, not session)
- The "resume" feature only works within the same provider
- UI shows a divider: "Switched to Codex" when provider changes mid-stream

```typescript
// In stream creation / query handling:
if (stream.lastProvider !== payload.provider) {
  // Don't pass resumeSessionId — start fresh
  payload.resumeSessionId = undefined
  // Optionally emit a system message: "Provider changed from Claude to Codex"
}
```

### Scenario: User switches back from Codex to Claude

Same logic — new session. Previous Claude sessions may still exist and could theoretically be resumed, but for v1, always start fresh after a provider switch.

## Rollout Stages

```
Stage 0: DB migration (add columns, all workspaces default "claude")
   ↓ zero impact, no code changes needed yet
Stage 1: MCP refactoring deployed behind feature flag (USE_STANDALONE_MCP=false)
   ↓ zero impact, old code still runs
Stage 2: Enable standalone MCP for Claude (USE_STANDALONE_MCP=true)
   ↓ Claude users now use stdio MCP servers (behavior identical, slightly different plumbing)
Stage 3: Deploy CodexProvider + provider selection backend
   ↓ Codex available via API, no frontend yet
Stage 4: Deploy frontend provider selector (behind ENABLE_CODEX_PROVIDER flag)
   ↓ Internal testing with flag enabled
Stage 5: Enable ENABLE_CODEX_PROVIDER for all users
   ↓ GA
```

Each stage is independently deployable and rollback-able.

## Data Preservation

- No existing data is modified or deleted at any stage
- Provider column has a default ('claude') — no null handling needed
- Stream messages are provider-agnostic in storage (raw JSON blobs)
- Session files remain on disk even after provider switch (cleanup can happen later via cron)
