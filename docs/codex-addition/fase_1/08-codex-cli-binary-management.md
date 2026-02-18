# Fase 1.8 — Codex CLI Binary Management

## Problem

The `@openai/codex-sdk` TypeScript SDK spawns the `codex` CLI binary (Rust, platform-specific). This binary must be installed, accessible after privilege drop, and kept up to date.

## Binary Architecture

```
@openai/codex-sdk (npm)
  → depends on @openai/codex (npm)
    → depends on @openai/codex-linux-x64 (platform-specific, contains Rust binary)
```

The SDK resolves the binary path via:
1. `codexPathOverride` option (explicit path)
2. `@openai/codex` package's exported binary path (node_modules resolution)
3. System PATH (`codex` command)

## Installation Options for Alive

### Option A: Global npm install (recommended for v1)
```bash
npm install -g @openai/codex
# Binary at: /usr/local/bin/codex (or wherever npm global bin is)
```
- Pros: Accessible by all users after privilege drop, simple
- Cons: Single version for all workspaces, manual updates

### Option B: Per-Alive dependency
```bash
# In packages/worker-pool/package.json:
"dependencies": {
  "@openai/codex-sdk": "^0.x",
  "@openai/codex": "^0.x"   # ensures binary is in node_modules
}
```
- Pros: Version-locked with Alive, automatic via `bun install`
- Cons: Binary in node_modules may not be accessible after UID/GID drop

### Option C: Explicit path with CodexProvider
```typescript
// CodexProvider always uses explicit path:
const CODEX_BINARY = process.env.CODEX_BINARY_PATH || "/usr/local/bin/codex"
new Codex({ codexPathOverride: CODEX_BINARY })
```
- Pros: Fully controlled, no resolution ambiguity
- Cons: Must manage path configuration

**Recommendation: Option A + C combined.** Global install for the binary, explicit path in CodexProvider for reliability.

## Post-Privilege-Drop Access

Alive workers drop privileges to workspace user UID/GID. The Codex binary must be:
1. **Readable** by the workspace user → `/usr/local/bin/codex` with `755` perms (default)
2. **Executable** → same as above
3. **No root-only dependencies** → Codex stores sessions in `~/.codex/sessions/` which maps to the workspace HOME

Alive already sets `HOME` per workspace to `/var/lib/claude-sessions/<workspace>/`. Codex will use `$HOME/.codex/` within that directory.

## Version Compatibility

The SDK and CLI must be compatible versions. The SDK's `CodexExec` passes `--experimental-json` flag — this must be supported by the installed CLI.

```typescript
// Version check in CodexProvider initialization:
async validateBinary(): Promise<{ version: string; compatible: boolean }> {
  const { stdout } = await execFile(this.codexPath, ["--version"])
  const version = stdout.trim()  // e.g. "codex 0.1.2026021700"
  const minVersion = "0.1.0"  // update as SDK evolves
  return { version, compatible: semver.gte(version, minVersion) }
}
```

## Update Strategy

For v1: manual updates via `npm update -g @openai/codex`

Future: Alive admin panel could show installed provider versions and offer one-click updates.

## Codex Home / Session Directory

Codex stores state in `~/.codex/`:
```
~/.codex/
├── config.toml          # user config (we override via SDK options)
├── sessions/            # conversation threads
│   ├── <thread-id-1>/
│   └── <thread-id-2>/
└── mcp/                 # MCP server registrations (we don't use this)
```

Since `HOME` is set per workspace, each workspace gets isolated Codex state automatically. This matches Alive's existing Claude session isolation pattern.

## Disk Space Considerations

Codex sessions contain conversation history. For active workspaces, this can grow:
- ~10-50KB per short query
- ~500KB-5MB per long multi-turn session
- Sessions persist indefinitely unless cleaned

**Cleanup:** Add a periodic job to delete Codex sessions older than 30 days:
```bash
find /var/lib/claude-sessions/*/.codex/sessions/ -maxdepth 1 -mtime +30 -exec rm -rf {} +
```

(Should also be done for Claude sessions — both grow unbounded.)
