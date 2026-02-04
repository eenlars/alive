---
name: Global MCP Provider Guide
description: Step-by-step guide to add a new Global MCP integration (like Google Maps, Context7). For OAuth providers, see oauth-integration-guide.
---

# Global MCP Provider Guide

You are an expert guide for adding new Global MCP integrations to Claude Bridge. Global providers are always available to ALL users without authentication (unlike OAuth providers which require per-user tokens).

## Overview

Adding a Global MCP integration requires changes to **3 files**. The architecture uses a **single source of truth** pattern - ALL provider configuration is centralized in `packages/shared/src/mcp-providers.ts`.

## Prerequisites

Before starting, confirm:
1. The MCP server is **running** and accessible (e.g., `http://localhost:PORT/mcp`)
2. The server implements **MCP JSON-RPC protocol** (tools/list, tools/call)
3. The server does **NOT require authentication** (use OAuth guide for authenticated providers)

## File Checklist

| # | File | Action | Required |
|---|------|--------|----------|
| 1 | `packages/shared/src/mcp-providers.ts` | Add to `GLOBAL_MCP_PROVIDERS` | Yes |
| 2 | Rebuild + Deploy | `make staging` | Yes |

That's it! Tool registry entries are **auto-generated** from the shared package.

## Step-by-Step Implementation

### Step 1: Add to Global MCP Provider Registry

**File:** `packages/shared/src/mcp-providers.ts`

Add your provider to `GLOBAL_MCP_PROVIDERS`:

```typescript
export const GLOBAL_MCP_PROVIDERS = {
  context7: {
    url: "http://localhost:8082/mcp",
    friendlyName: "Context7",
    knownTools: ["mcp__context7__resolve-library-id", "mcp__context7__get-library-docs"] as const,
  },
  // ADD YOUR PROVIDER:
  "your-provider": {
    url: "http://localhost:PORT/mcp",      // MCP server URL
    friendlyName: "Your Provider Name",     // Display name in UI
    knownTools: [
      "mcp__your-provider__tool_one",       // MUST match exactly what SDK will call
      "mcp__your-provider__tool_two",
    ] as const,
  },
} as const satisfies GlobalMcpProviderRegistry
```

**Critical: Tool Name Format**

The `knownTools` array MUST use exact SDK tool naming:
```
mcp__{provider-key}__{tool-name-from-server}
```

Example: If your server returns `{"name": "search_maps"}` and your provider key is `"google-scraper"`, the tool name is:
```
mcp__google-scraper__search_maps
```

### Step 2: Tool Registry (automatic!)

**No manual step needed.** External MCP entries are auto-generated from `GLOBAL_MCP_PROVIDERS` and `OAUTH_MCP_PROVIDERS`.

The `tool-registry.ts` file automatically includes external MCPs via:
```typescript
export const FULL_TOOL_REGISTRY: ToolMetadata[] = [
  ...INTERNAL_TOOL_REGISTRY,
  ...generateExternalMcpEntries(), // Auto-generated from shared registries
]
```

This means:
- No duplication between shared package and tool registry
- Single source of truth in `mcp-providers.ts`
- `search_tools` automatically discovers new providers

### Step 3: Rebuild and Deploy

```bash
# Rebuild packages
bun run build --filter=@webalive/shared --filter=@webalive/tools

# Deploy to staging
make staging

# Or for dev
make dev
```

## How It Works (Architecture)

### Tool Allowlist Flow

```
GLOBAL_MCP_PROVIDERS.knownTools
         │
         ▼
getGlobalMcpToolNames()         ─── extracts all tool names
         │
         ▼
getBridgeAllowedTools()         ─── combines: SDK tools + internal MCP + global MCP
         │
         ▼
Worker receives allowedTools    ─── enforces via canUseTool()
```

### MCP Server Connection Flow

```
getBridgeMcpServers()           ─── builds server config:
         │                          - alive-workspace (internal)
         │                          - alive-tools (internal)
         │                          - OAuth servers (if token)
         │                          - GLOBAL_MCP_PROVIDERS (always)
         ▼
Worker passes mcpServers        ─── to Claude Agent SDK
         │
         ▼
SDK connects to HTTP MCPs       ─── JSON-RPC over HTTP
```

### Key Files

| File | Purpose |
|------|---------|
| `packages/shared/src/mcp-providers.ts` | Provider registry (URLs, tools, names) |
| `packages/shared/src/stream-tools.ts` | `getBridgeMcpServers()` builds server config |
| `packages/tools/src/tools/meta/tool-registry.ts` | Discovery via `search_tools` |
| `apps/web/scripts/run-agent.mjs` | Legacy runner (calls getMcpServers) |
| `packages/worker-pool/src/worker-entry.mjs` | Persistent worker |

## What Works Automatically

Once you add the provider to `GLOBAL_MCP_PROVIDERS`:

| Feature | How it works |
|---------|--------------|
| Tool permissions | `knownTools` added to `allowedTools` via `getGlobalMcpToolNames()` |
| MCP connection | Server config added via `getBridgeMcpServers()` loop |
| SDK tools | Available as `mcp__{provider}__{tool}` in Claude |
| Discovery | Shows in `search_tools` output (if registry entry exists) |

## Testing Checklist

- [ ] MCP server running: `curl http://localhost:PORT/mcp`
- [ ] Tool names in `knownTools` match SDK format exactly
- [ ] Registry entry uses snake_case name
- [ ] Registry entry has `enabled: false`
- [ ] TypeScript compiles: `bun run type-check`
- [ ] Tests pass: `bun run test`
- [ ] Deploy succeeds: `make staging`
- [ ] Check staging logs: `journalctl -u alive-staging -f | grep -i mcp`

## Common Pitfalls

### 1. Tool not available (denied)

**Cause:** Tool name in `knownTools` doesn't match what SDK requests

**Fix:** Check exact tool name format:
```bash
# Get actual tool names from MCP server
curl -X POST -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  http://localhost:PORT/mcp
```

### 2. MCP server not connecting

**Cause:** Port mismatch or server not running

**Fix:**
```bash
# Check server is running
ss -tlnp | grep PORT

# Check systemd service
systemctl status mcp-your-provider
```

### 3. Tool not showing in search_tools

**Cause:** Missing from `GLOBAL_MCP_PROVIDERS` in shared package

**Fix:** Add entry to `packages/shared/src/mcp-providers.ts` and rebuild

## Testing MCP Server

```bash
# List available tools
curl -X POST -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  http://localhost:PORT/mcp

# Call a tool
curl -X POST -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"tool_name","arguments":{}},"id":1}' \
  http://localhost:PORT/mcp
```

## Reference: Existing Global Providers

| Provider | Port | Tools |
|----------|------|-------|
| context7 | 8082 | resolve-library-id, get-library-docs |
| google-scraper | 8083 | search_google_maps |

## Related

- **OAuth MCP providers** (Stripe, Linear): See `oauth-integration-guide` skill
- **Internal MCP tools** (alive-workspace, alive-tools): See `tools-guide` skill
