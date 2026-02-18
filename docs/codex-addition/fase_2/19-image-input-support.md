# Fase 2.19 — Image Input Support

## Current State

Alive supports text-only prompts to agents. Neither Claude nor Codex image input is wired up.

## Codex SDK Image Support

```typescript
type UserInput =
  | { type: "text"; text: string }
  | { type: "local_image"; path: string };

type Input = string | UserInput[];

// Usage:
await thread.run([
  { type: "text", text: "What's in this screenshot?" },
  { type: "local_image", path: "/workspace/screenshot.png" }
]);
```

Codex requires images as **local file paths**. No base64, no URLs.

## Claude SDK Image Support

Claude Agent SDK accepts images via the standard Anthropic message format:

```typescript
// Via content blocks in the prompt
query({
  prompt: [
    { type: "text", text: "What's in this image?" },
    { type: "image", source: { type: "base64", media_type: "image/png", data: "..." } }
  ]
});
```

## Unified Interface

```typescript
type AgentInput =
  | string
  | Array<{ type: "text"; text: string } | { type: "image"; path: string }>;
```

### Provider Mapping

| Alive unified | Claude | Codex |
|---|---|---|
| `{ type: "text", text }` | `{ type: "text", text }` | `{ type: "text", text }` |
| `{ type: "image", path }` | Read file → base64 → `{ type: "image", source: { type: "base64", ... } }` | `{ type: "local_image", path }` |

### Key Differences

- **Claude**: Needs base64 encoding of the image
- **Codex**: Needs the file path directly
- Both need the file to exist on disk in the workspace

### Implementation Priority

**v2 feature** — not needed for initial multi-provider launch. Text-only is sufficient for v1. But the `AgentInput` type should be designed to accommodate images from the start so we don't need a breaking change later.

### Frontend Impact

Would need an image upload component in the chat input. Images get saved to workspace directory, path passed to provider. Not in scope for fase 2.
