# SDK Exec Layer Audit — Feb 18 20:00

Source: `sdk/typescript/src/exec.ts` (verified against GitHub main)

## How the SDK Actually Works

The SDK is a thin wrapper around `codex exec --experimental-json`. Understanding this is critical for the Alive integration.

### Process Lifecycle

```
1. SDK builds CLI args from ThreadOptions + CodexOptions
2. SDK spawns: `codex exec --experimental-json [args...]`
3. SDK writes user input to child.stdin, then closes stdin
4. SDK reads JSONL lines from child.stdout
5. SDK parses each line as ThreadEvent
6. On thread.started event, captures thread_id
7. On exit, checks exit code + stderr for errors
```

### CLI Arg Mapping (from exec.ts)

| SDK Option | CLI Arg |
|---|---|
| `model` | `--model <model>` |
| `sandboxMode` | `--sandbox <mode>` |
| `workingDirectory` | `--cd <dir>` |
| `additionalDirectories` | `--add-dir <dir>` (repeated) |
| `skipGitRepoCheck` | `--skip-git-repo-check` |
| `outputSchemaFile` | `--output-schema <path>` |
| `modelReasoningEffort` | `--config model_reasoning_effort="<level>"` |
| `networkAccessEnabled` | `--config sandbox_workspace_write.network_access=<bool>` |
| `webSearchMode` | `--config web_search="<mode>"` |
| `approvalPolicy` | `--config approval_policy="<mode>"` |
| `threadId` | `resume <id>` (appended after other args) |
| `images` | `--image <path>` (repeated) |

### Config Flattening

`CodexOptions.config` is a nested object that gets flattened to `--config key=value` pairs using TOML serialization:

```typescript
// Input
config: {
  developer_instructions: "You are an assistant for the Alive platform.",
  ephemeral: true,
}
// Becomes CLI args:
// --config developer_instructions="You are an assistant for the Alive platform."
// --config ephemeral=true
```

Nested objects use dotted paths:
```typescript
config: { sandbox_workspace_write: { network_access: true } }
// --config sandbox_workspace_write.network_access=true
```

### Environment Variables

```typescript
// When envOverride is provided:
const env = { ...this.envOverride };
// When NOT provided:
const env = { ...process.env };

// Always added:
env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE = "codex_sdk_ts";
env.OPENAI_BASE_URL = args.baseUrl;  // if provided
env.CODEX_API_KEY = args.apiKey;      // if provided
```

**CRITICAL**: When `env` is set in CodexOptions, it REPLACES process.env entirely. The SDK does NOT merge. `CODEX_API_KEY` and `OPENAI_BASE_URL` are always injected on top.

### Binary Resolution

1. Check `codexPathOverride` (from CodexOptions)
2. Try platform-specific npm package (e.g., `@openai/codex-linux-x64`)
3. Try `@openai/codex` package
4. Fall back to `codex` on PATH

Platform packages contain the Rust binary vendored as an npm dependency.

### Error Handling

- Spawn errors captured via `child.once("error", ...)`
- Non-zero exit: throws with stderr content
- Signal kill: throws with signal name
- Parse errors: throws if JSONL line isn't valid JSON

### AbortSignal

```typescript
const child = spawn(this.executablePath, commandArgs, {
  env,
  signal: args.signal,  // Node.js spawn option — kills process on abort
});
```

Node.js `spawn` with `signal` option automatically kills the child process when the signal fires. No manual cleanup needed.

## Implications for Alive's CodexProvider

1. **developer_instructions via config is the correct approach** — flattened to `--config developer_instructions="..."`. No CODEX.md file needed.
2. **env must include PATH** — otherwise Codex subprocess can't find system binaries
3. **AbortSignal is clean** — just pass AbortController.signal, Node handles cleanup
4. **Binary can be vendored** — install `@openai/codex` as dependency, SDK finds it automatically
5. **Input goes to stdin** — single prompt per turn, not interactive
6. **Thread resume** — just appends `resume <id>` to args, same process model
