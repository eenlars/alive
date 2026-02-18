# Fase 2.12 — System Prompt Injection for Codex

## Problem

Claude SDK has a `systemPrompt` option — Alive uses this to inject workspace context (project type, user preferences, tool instructions). Codex has **no** system prompt option in the SDK.

## Codex's Built-in Prompt

Codex has a hardcoded system prompt (in the Rust core). It includes:
- Instructions for using tools (shell, file edits)
- Sandbox rules
- Code style guidelines

Users can customize behavior via:
1. `CODEX.md` file in the working directory
2. `~/.codex/instructions.md` global file
3. `--config system_message="..."` CLI flag (undocumented but exists in config.toml schema)

## Options for Alive

### Option A: CODEX.md file (recommended for v1)

Before spawning Codex, write a `CODEX.md` file to the workspace directory:

```typescript
// In CodexProvider.query():
const codexMdPath = path.join(config.cwd, "CODEX.md")
const codexInstructions = buildCodexInstructions(config)
await fs.writeFile(codexMdPath, codexInstructions)
```

Content template:
```markdown
# Alive Workspace Instructions

## Project
{workspace.name} — {workspace.description}

## Available Tools (MCP)
You have access to these MCP servers:
- alive-workspace: File operations, project management
- alive-tools: Search, deploy, restart dev server
- alive-email: Send/read emails (if enabled)

## Rules
- Always use the workspace tools for file operations
- Don't modify files outside the workspace directory
- {additional user-configured instructions}
```

**Pros:**
- Works natively with Codex's instruction loading
- User can edit CODEX.md directly for customization
- No undocumented API usage

**Cons:**
- File must exist before each query (or persist in workspace)
- If user has their own CODEX.md, it gets overwritten
- Codex may not read CODEX.md on `resume` (need to verify)

### Option B: config system_message

```typescript
new Codex({
  config: {
    system_message: "You are working in an Alive workspace..."
  }
})
```

**Status:** Untested. The `config.toml` schema likely supports `system_message` but it's not documented for the SDK path. The exec.ts `flattenConfigOverrides` would serialize it as `--config system_message="..."`.

**Risk:** Could break if Codex changes config schema. Not officially supported.

### Option C: Prepend to user prompt

```typescript
const augmentedPrompt = `[System context: ${systemPrompt}]\n\n${userPrompt}`
```

**Pros:** Simple, works everywhere
**Cons:** Pollutes user prompt, weaker than system prompt, model may ignore

## Recommendation

**v1: Option A (CODEX.md) + Option C (prompt prepend) as fallback.**

1. Write `CODEX.md` to workspace before first Codex query
2. Don't overwrite if user has modified it (check mtime or hash)
3. For critical instructions that MUST apply, prepend to prompt

**v2: Investigate Option B** once we have Codex integration working. Test if `--config system_message=` actually works.

## User's Own CODEX.md

If the user already has a CODEX.md in their project, we should:
1. Read existing content
2. Append Alive-specific instructions as a clearly marked section
3. On cleanup/session end, optionally remove the Alive section

```markdown
# User's existing CODEX.md content...

---
<!-- ALIVE_WORKSPACE_CONTEXT (auto-generated, do not edit) -->
## Alive Workspace
{alive instructions}
<!-- /ALIVE_WORKSPACE_CONTEXT -->
```

This preserves user customization while injecting Alive context.

## Session Resume Behavior

**Unknown:** Does Codex re-read CODEX.md on `resume`? If not, instructions only apply to the first turn.

**Test needed:** Run a thread, modify CODEX.md, resume — does the agent see the new instructions?

If Codex doesn't re-read: the CODEX.md approach only works for new threads. For resumed threads, prompt prepend (Option C) is the only reliable method.
