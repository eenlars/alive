# Codex Addition — Multi-Agent Provider Support for Alive

## Goal
Add Codex (OpenAI) as a second coding agent provider alongside Claude Code. Users should be able to switch between Claude and Codex per workspace or per query.

## Status
**Planning phase** — iterating every 4 hours until Thursday Feb 20.

## Architecture Overview
Current: `worker-entry.mjs` imports `@anthropic-ai/claude-agent-sdk` directly. Everything is Claude-specific.

Target: Abstract the agent layer so the worker can spawn either Claude or Codex (or future providers) based on workspace config.

## Phases
- **Fase 1**: Research & architecture — understand both SDKs, map differences, design abstraction
- **Fase 2**: Implementation plan — exact files to change, new files to create, migration path
- **Fase 3**: Testing & rollout — how to test, feature flags, gradual rollout

## Key Files (current Claude integration)
- `packages/worker-pool/src/worker-entry.mjs` — main worker, imports claude-agent-sdk
- `packages/worker-pool/src/manager.ts` — spawns workers, manages pool
- `packages/worker-pool/src/types.ts` — type definitions
- `packages/worker-pool/package.json` — depends on `@anthropic-ai/claude-agent-sdk`
- `packages/shared/` — tool context, permission logic, defaults

## Open Questions (to resolve during planning)
- Does Codex have a Node SDK or only CLI?
- How does Codex handle tools/MCP?
- How does Codex handle sessions/resume?
- Can both run in the same worker process or need separate workers?
- How to handle auth (API keys) per provider?
- How does the frontend switch between providers?

## Log
- **2026-02-17 00:00** — Initial research: current Alive architecture (fase_1/01), Codex SDK analysis (fase_1/02), Emdash reference analysis (fase_1/03)
- Emdash (YC W26) supports 21 agents via CLI spawning. Simple but no tool control. Their provider registry is clean reference material.
- Codex has a TypeScript SDK (`@openai/codex-sdk`) — structured events, thread-based sessions. Viable for SDK integration.
- **DECISION: Path B only.** SDK integration for Claude + Codex. No CLI fallback. Tool control and MCP are essential to the product — not negotiable. Every provider must support structured events, tool permissions, and MCP servers.
