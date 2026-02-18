# Fase 2.13 — Cost & Billing: Provider Comparison

## Token Pricing (Feb 2026, approximate)

| Model | Input (per 1M) | Output (per 1M) | Cached Input |
|-------|----------------|------------------|-------------|
| Claude Sonnet 4 | $3.00 | $15.00 | $0.30 |
| Claude Opus 4 | $15.00 | $75.00 | $1.50 |
| GPT-5.1 | $2.00 | $8.00 | $0.50 |
| GPT-5.1-mini | $0.30 | $1.20 | $0.10 |
| o3 | $10.00 | $40.00 | — |

*Prices change frequently. These are indicative.*

## Usage Tracking

### Claude (current)
Alive tracks usage from Claude SDK's `result` message:
- `inputTokens`, `outputTokens` reported per query
- No cached token breakdown currently displayed
- Stored in stream metadata

### Codex
`TurnCompletedEvent.usage` provides:
- `input_tokens`
- `cached_input_tokens` 
- `output_tokens`

Same data shape — maps directly to Alive's existing usage tracking.

## Billing Display (v1)

For v1, keep it simple:
- Track tokens per provider per stream
- Display total cost estimate based on model pricing
- Provider badge next to cost in stream header
- Workspace-level usage dashboard: breakdowns by provider

### Schema

```sql
-- Extend existing stream_usage or create new:
ALTER TABLE streams ADD COLUMN provider TEXT DEFAULT 'claude';
-- Usage is already tracked per-stream, just add provider context
```

No per-provider billing system needed for v1 — requests use server-managed provider credentials; users pay their provider directly via their account outside Alive.

## Cost Optimization Notes

- Codex's `cached_input_tokens` pricing is much cheaper — encourage session reuse
- Claude's prompt caching kicks in automatically for long system prompts
- For cost-conscious users: recommend GPT-5.1-mini for simple tasks, Claude Sonnet for complex ones
- Model selector in workspace settings should show approximate cost tier (💰/💰💰/💰💰💰)

## Mid-Conversation Provider Switch

**Not supported in v1.** Provider is set per workspace.

If we allow per-query provider switch later:
- Each stream segment tracks its own provider + usage
- Total cost = sum of all segments
- UI shows provider badge per message group
- Session context doesn't transfer between providers (different conversation formats)
