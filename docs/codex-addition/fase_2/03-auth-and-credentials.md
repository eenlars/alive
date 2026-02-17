# Fase 2.3 — Auth & Credential Management

## Current State: Claude Auth

Alive supports Claude auth via:
1. **OAuth** — User connects Anthropic account, OAuth tokens stored and refreshed
2. **API key** — User provides `ANTHROPIC_API_KEY` (set on server or via payload)
3. **CLAUDE_CONFIG_DIR** — Shared credential directory at `/root/.claude`

Worker receives auth via:
- `payload.apiKey` — if user provides their own key
- `process.env.ANTHROPIC_API_KEY` — server-level fallback
- `CLAUDE_CONFIG_DIR` — OAuth credentials directory

## Codex Auth Options

### Option 1: API Key (recommended for v1)
- User provides `OPENAI_API_KEY` in workspace settings
- Stored encrypted in lockbox
- Passed to worker via `payload.apiKey`
- Worker sets `OPENAI_API_KEY` env var before spawning Codex

```typescript
// In CodexProvider:
const codex = new Codex({
  apiKey: config.apiKey,  // SDK handles the env var
  // or
  env: { OPENAI_API_KEY: config.apiKey },
})
```

### Option 2: ChatGPT Login (NOT suitable for server)
- Codex CLI supports `codex --login` for ChatGPT account login
- Uses browser-based OAuth flow
- Stores session in `~/.codex/`
- **Not viable** for Alive's server-side architecture — requires interactive browser

### Option 3: Server-Level API Key
- Set `OPENAI_API_KEY` env var on the server
- All workspaces share the same key
- Simple but no per-user billing
- Good for single-tenant / self-hosted Alive

## Recommended Implementation

### Phase 1: Per-Workspace API Key

```
User → Workspace Settings → "Enter OpenAI API Key" → Encrypted in Lockbox
                                                          ↓
                                                    Worker Payload
                                                          ↓
                                                    CodexProvider
                                                          ↓
                                                    Codex SDK (apiKey option)
```

### Phase 2: OpenAI OAuth (future)

OpenAI may add OAuth support for programmatic access. When available:
- Add OpenAI to Alive's OAuth provider list
- Store/refresh tokens like Anthropic
- Pass via worker payload

## Security Considerations

1. **Key isolation** — Each workspace's API key must not leak to other workspaces
   - Current `prepareRequestEnv()` already handles this via env cleanup per request
   - Codex SDK's `env` option prevents inheriting process.env

2. **Key rotation** — If a key is compromised, user changes it in workspace settings
   - No server restart needed
   - Next query uses new key

3. **Billing visibility** — Users need to understand which provider they're using
   - Clear provider badge in UI
   - Usage stats per provider (token counts from `turn.completed`)

4. **Key validation** — Validate API key format before storing
   - OpenAI keys start with `sk-`
   - Can test with a lightweight API call on save

## Env Isolation Changes

Current `prepareRequestEnv()` in `env-isolation.ts`:

```typescript
// Currently handles:
// - ANTHROPIC_API_KEY
// - User env keys
// - Cleanup of previous request's env vars

// Needs to also handle:
// - OPENAI_API_KEY (for Codex)
// - CODEX_HOME (session directory for Codex)
// - Provider-specific env vars
```

Add provider-specific env setup:

```typescript
export function prepareRequestEnv(payload: QueryPayload): EnvResult {
  // ... existing cleanup ...
  
  if (payload.provider === "codex") {
    // Set Codex-specific env
    if (payload.apiKey) {
      process.env.OPENAI_API_KEY = payload.apiKey
    }
    // Clean Anthropic env
    delete process.env.ANTHROPIC_API_KEY
  } else {
    // Set Claude-specific env (existing logic)
    if (payload.apiKey) {
      process.env.ANTHROPIC_API_KEY = payload.apiKey
    }
    // Clean Codex env
    delete process.env.OPENAI_API_KEY
  }
}
```

## Codex CLI Installation

The Codex TypeScript SDK spawns the `codex` CLI binary. It must be installed:

```bash
# On the server
npm install -g @openai/codex

# Or per-project
npm install @openai/codex
```

The SDK has a `codexPathOverride` option for custom binary location:

```typescript
const codex = new Codex({
  codexPathOverride: "/usr/local/bin/codex",
})
```

**Important**: The `codex` binary must be accessible after privilege drop (UID/GID change). Install system-wide, not in `/root/`.
