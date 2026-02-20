# Input Delivery — stdin vs CLI args

## Discovery (Feb 19)

From `exec.ts`, the user's prompt is delivered via **stdin**, not as a CLI argument:

```typescript
child.stdin.write(args.input);
child.stdin.end();
```

This is important for several reasons:

1. **No shell escaping issues** — large prompts with special characters, quotes, newlines are safe
2. **No argument length limits** — shell arg limits (~128KB on Linux) don't apply
3. **No prompt visibility in `ps` output** — security benefit, prompts aren't visible in process listings

## Implications for Alive

### System Prompt Delivery

`developer_instructions` is passed via `--config` CLI arg, NOT via stdin. This means:
- System prompts ARE visible in `ps` output (minor security concern)
- System prompts ARE subject to CLI arg length limits
- For very long system prompts, consider using CODEX.md file approach instead

### Image Delivery

Images are passed as `--image <path>` CLI args. The files must exist on disk at the specified path. For Alive:
- User-uploaded images must be saved to a workspace-accessible path first
- The path must be within the workspace or an `additionalDirectories` entry

### Multi-turn Conversations

Each `runStreamed()` call is a separate `codex exec` invocation with a fresh child process. Thread continuity is maintained via `resume <threadId>` arg. The new prompt is delivered via stdin each time.

This means:
- No persistent connection to Codex CLI
- Each turn has ~100-500ms startup overhead
- Thread state is stored on disk (in CODEX_HOME/sessions/)

## Comparison with Claude

| Aspect | Claude SDK | Codex SDK |
|--------|-----------|-----------|
| Input delivery | In-process function call | stdin to child process |
| System prompt | `systemPrompt` option | `--config developer_instructions=` |
| Multi-turn | In-memory session | Disk-persisted thread + `resume` |
| Streaming | In-process events | stdout JSONL lines |
| Lifecycle | Process-long | Per-turn subprocess |
