---
name: oauth-integration-guide
description: Step-by-step guide to add a new OAuth MCP integration (like Linear, Stripe, Supabase).
---

# OAuth MCP Integration Guide

You are an expert guide for adding new OAuth MCP integrations to Alive. This guide covers adding providers like Supabase, Notion, Slack, or any service that offers OAuth + MCP.

## Overview

Adding an OAuth MCP integration requires changes to **5 files** plus environment variables and a **database entry**. The architecture uses a **single source of truth** pattern - ALL provider configuration is centralized in `packages/shared/src/mcp-providers.ts`.

## Prerequisites

Before starting, confirm:
1. The service has an **MCP server URL** (e.g., `https://mcp.service.com`)
2. The service supports **OAuth 2.0 authorization code flow**
3. You have access to create an OAuth application in the service's developer console

## File Checklist

| # | File | Action | Required |
|---|------|--------|----------|
| 1 | `packages/shared/src/mcp-providers.ts` | Add to registry (SINGLE SOURCE OF TRUTH) | Yes |
| 2 | `packages/oauth-core/src/providers/[provider].ts` | New OAuth provider class | Yes |
| 3a | `packages/oauth-core/src/providers/index.ts` | Register in Map + export | Yes |
| 3b | `packages/oauth-core/src/index.ts` | Export from package | Yes |
| 4 | `apps/web/lib/integrations/registry.tsx` | Add to UI registry | Yes |
| 5 | `.env` / `.env.local` | Add credentials | Yes |
| 6 | **Database** | Add to `integrations.providers` | Yes |

**No longer needed** (auto-derived from shared registry):
- ~~`apps/web/lib/oauth/providers.ts`~~ - `OAuthProvider` type derived from `OAuthMcpProviderKey`
- ~~`apps/web/lib/oauth/oauth-instances.ts`~~ - generic `getOAuthInstance(provider)` factory handles all providers automatically

## Step-by-Step Implementation

### Step 1: Add to MCP Provider Registry (SINGLE SOURCE OF TRUTH)

**File:** `packages/shared/src/mcp-providers.ts`

Add your provider to `OAUTH_MCP_PROVIDERS` with ALL configuration:

```typescript
export const OAUTH_MCP_PROVIDERS = {
  // ...existing providers (stripe, linear)

  supabase: {
    url: "https://mcp.supabase.com",    // MCP server endpoint
    oauthKey: "supabase",                // Must match provider name exactly
    friendlyName: "Supabase",            // Display name in UI
    defaultScopes: "projects:read,tables:read,tables:write",  // OAuth scopes
    envPrefix: "SUPABASE",               // For SUPABASE_CLIENT_ID env var
    knownTools: [
      // List known tools for documentation (auto-discovered at runtime)
      "mcp__supabase__list_tables",
      "mcp__supabase__query",
      "mcp__supabase__insert_row",
    ],
  },
} as const satisfies OAuthMcpProviderRegistry
```

**Interface definition** (for reference):
```typescript
export interface OAuthMcpProviderConfig {
  url: string           // MCP server URL
  oauthKey: string      // Must match provider in oauth-core
  friendlyName: string  // Human-readable name for UI
  defaultScopes: string // OAuth scopes (format varies by provider)
  envPrefix: string     // Env var prefix (e.g., "STRIPE" → STRIPE_CLIENT_ID)
  knownTools?: readonly string[]  // Optional, for documentation only
}
```

**Important:**
- `oauthKey` must match the provider name used in `oauth-core/providers/`
- `url` is the MCP server endpoint that accepts Bearer tokens
- `defaultScopes` - check provider docs for format (comma vs space separated)
- `envPrefix` - used to find `{PREFIX}_CLIENT_ID` and `{PREFIX}_CLIENT_SECRET`
- `knownTools` is optional but helpful for documentation

**After this step, everything auto-derives:**
- `OAuthMcpProviderKey` type includes the new provider (`"stripe" | "linear" | "supabase"`)
- `OAuthProvider` type in `apps/web/lib/oauth/providers.ts` automatically includes it
- `getOAuthInstance("supabase")` in `oauth-instances.ts` automatically works
- `SUPPORTED_OAUTH_PROVIDERS` array includes it
- `isOAuthProviderSupported("supabase")` returns true

### Step 2: Create OAuth Provider Class

**File:** `packages/oauth-core/src/providers/[provider].ts` (new file)

Create the OAuth provider implementation:

```typescript
/**
 * [Provider] OAuth Provider
 *
 * Implements OAuth 2.0 flow for [Provider]
 * Docs: [link to provider OAuth docs]
 */

import type { OAuthProvider } from "./base"
import type { OAuthTokens } from "../types"

export const [PROVIDER]_SCOPES = ["scope1", "scope2"] as const

export class [Provider]Provider implements OAuthProvider {
  name = "[provider]"

  /**
   * Exchanges authorization code for access token
   */
  async exchangeCode(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri?: string
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
    })

    if (redirectUri) {
      params.append("redirect_uri", redirectUri)
    }

    const res = await fetch("https://[provider].com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`[Provider] OAuth failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    if (data.error) {
      throw new Error(`[Provider] OAuth error: ${data.error_description || data.error}`)
    }

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type || "Bearer",
    }
  }

  /**
   * Refreshes an expired access token
   */
  async refreshToken(
    refreshToken: string,
    clientId: string,
    clientSecret: string
  ): Promise<OAuthTokens> {
    const params = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    })

    const res = await fetch("https://[provider].com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    })

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`[Provider] token refresh failed: ${res.status} ${error}`)
    }

    const data = await res.json()

    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_in: data.expires_in,
      scope: data.scope,
      token_type: data.token_type || "Bearer",
    }
  }

  /**
   * Generates authorization URL
   */
  getAuthUrl(
    clientId: string,
    redirectUri: string,
    scope: string,
    state?: string
  ): string {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
    })

    if (state) {
      params.append("state", state)
    }

    return `https://[provider].com/oauth/authorize?${params.toString()}`
  }
}
```

**Provider-specific notes:**
- Some providers use comma-separated scopes (Linear: `read,write`), others use space-separated (Stripe: `read_write`)
- Some don't support refresh tokens - check provider docs
- Token endpoint content types vary (`application/x-www-form-urlencoded` vs `application/json`)

### Step 3: Register Provider (TWO files!)

**File 1:** `packages/oauth-core/src/providers/index.ts`

```typescript
import { [Provider]Provider } from "./[provider]"

// In providers Map initialization:
providers.set("[provider]", new [Provider]Provider())

// In exports at bottom of file:
export { [Provider]Provider }
```

**File 2:** `packages/oauth-core/src/index.ts`

```typescript
// Add with other provider exports:
export { [PROVIDER]_SCOPES, [Provider]Provider } from "./providers/[provider]"
```

### Step 4: Add to UI Registry

**File:** `apps/web/lib/integrations/registry.tsx`

```typescript
export const INTEGRATION_UI_REGISTRY = {
  // ...existing
  [provider]: null,  // null = no custom UI, shows connection status only
} as const satisfies Record<OAuthMcpProviderKey, IntegrationUIConfig | null>
```

**Note:** TypeScript enforces this - if you add to `OAUTH_MCP_PROVIDERS`, you must add here.

### Step 5: Environment Variables

Add to `.env` and `.env.local`:

```bash
# [Provider] OAuth
[PROVIDER]_CLIENT_ID=your_client_id
[PROVIDER]_CLIENT_SECRET=your_client_secret
# Optional: explicit redirect URI (defaults to {APP_URL}/api/auth/[provider])
[PROVIDER]_REDIRECT_URI=https://terminal.goalive.nl/api/auth/[provider]
```

**(Optional)** Add to env schema for validation: `packages/env/src/schema.ts`

### Step 6: Add Database Entry (REQUIRED)

**Without this step, the integration won't appear in Settings UI.**

Add to `integrations.providers` table:

```sql
INSERT INTO integrations.providers (
  provider_key,
  display_name,
  visibility_level,
  is_active,
  logo_path,
  default_scopes
) VALUES (
  '[provider]',
  '[Provider]',
  'admin_only',  -- 'public' | 'admin_only' | 'beta'
  true,
  '/integrations/[provider].svg',
  '["scope1", "scope2"]'::jsonb
)
ON CONFLICT (provider_key) DO NOTHING;
```

For `admin_only` providers, grant user access:

```sql
INSERT INTO integrations.access_policies (provider_id, user_id)
SELECT p.provider_id, u.user_id
FROM integrations.providers p
JOIN iam.users u ON u.email = 'user@example.com'
WHERE p.provider_key = '[provider]'
ON CONFLICT (provider_id, user_id) DO NOTHING;
```

## What Works Automatically

Once you add the provider to `packages/shared/src/mcp-providers.ts`, these features work without any additional code:

| Feature | How it works |
|---------|--------------|
| `OAuthProvider` type | Derived from `OAuthMcpProviderKey` in `apps/web/lib/oauth/providers.ts` |
| `getOAuthInstance(provider)` | Generic singleton factory in `oauth-instances.ts` - creates instances on demand |
| `isOAuthProviderSupported()` | Checks against `OAUTH_MCP_PROVIDERS` keys |
| `SUPPORTED_OAUTH_PROVIDERS` | Array derived from `Object.keys(OAUTH_MCP_PROVIDERS)` |
| OAuth flow | `/api/auth/[provider]` dynamic route handles all providers |
| Token storage | Encrypted in `lockbox.user_secrets` via OAuthManager |
| Token refresh | `OAuthManager.getAccessToken()` refreshes transparently |
| MCP injection | `getOAuthMcpServers()` iterates registry dynamically |
| Tool permissions | `mcp__[provider]__*` tools auto-allowed when connected |
| Settings UI | Reads from `integrations.providers` database table |

## Testing Checklist

- [ ] Database entry exists in `integrations.providers`
- [ ] User has access via `integrations.access_policies` (or visibility is 'public')
- [ ] Integration appears in Settings UI
- [ ] OAuth flow completes successfully
- [ ] MCP tools appear in Claude's available tools
- [ ] Tools execute with Bearer token
- [ ] TypeScript compiles: `bun run type-check`
- [ ] Build succeeds: `bun run build`
- [ ] Tests pass: `bun run test`

**Testing Notes:**
- Always use `bun run test`, never `bun test` directly
- Do NOT use `npx vitest` - npx and vitest don't work well together in this codebase

## Common Pitfalls

1. **Missing database entry** - Integration won't show in Settings UI (most common issue!)
2. **Mismatched provider names** - `oauthKey` in registry, provider class `name`, and env prefix key must all match
3. **Wrong scope format** - Linear uses commas (`read,write`), most others use spaces (`read write`)
4. **Missing UI registry entry** - TypeScript will catch this at compile time
5. **Forgetting oauth-core exports** - Must update both `providers/index.ts` AND `index.ts`

## Reference Files

| Purpose | File |
|---------|------|
| **Single source of truth** | `packages/shared/src/mcp-providers.ts` |
| OAuth type derivation | `apps/web/lib/oauth/providers.ts` (derives from shared) |
| Generic factory | `apps/web/lib/oauth/oauth-instances.ts` (singleton Map pattern) |
| Linear example | `packages/oauth-core/src/providers/linear.ts` |
| Stripe example | `packages/oauth-core/src/providers/stripe.ts` |
| UI registry | `apps/web/lib/integrations/registry.tsx` |
| Database schema | `docs/oauth/MAIN.md` |

## Final Verification

```bash
# Should show your provider in the registry:
grep -n "[provider]" packages/shared/src/mcp-providers.ts

# Should show provider class registration:
grep -n "[provider]" packages/oauth-core/src/providers/index.ts
grep -n "[provider]" packages/oauth-core/src/index.ts

# Should show UI registry entry:
grep -n "[provider]" apps/web/lib/integrations/registry.tsx

# TypeScript should compile (validates types across all files):
bun run type-check

# Build should succeed:
bun run build
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                 packages/shared/src/mcp-providers.ts            │
│                     SINGLE SOURCE OF TRUTH                      │
│                                                                 │
│  OAUTH_MCP_PROVIDERS = {                                        │
│    stripe: { url, oauthKey, friendlyName, defaultScopes, ... } │
│    linear: { url, oauthKey, friendlyName, defaultScopes, ... } │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌────────────────────┐
│ providers.ts  │   │ oauth-instances │   │ Other consumers    │
│               │   │                 │   │ (stream route,     │
│ OAuthProvider │   │ getOAuthInstance│   │  MCP config, etc.) │
│   = derived   │   │   = generic     │   │                    │
└───────────────┘   └─────────────────┘   └────────────────────┘
```
