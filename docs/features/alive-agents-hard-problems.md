# Alive Agents: Hard Problems

What's actually hard about making a CoC-style agent system.

## CoC Mechanics → Agent Equivalents

| CoC | Agent System | Hard? |
|-----|--------------|-------|
| Different troop types | Agent roles (researcher, coder, reviewer) | Easy - just different configs/prompts |
| Deploy and watch | Background agents + SSE | Easy - V1 covers this |
| Limited resources | Token budgets | Medium - need enforcement during run |
| Troops can die | Agents can fail | Easy - just status |
| Strategic deployment | Context passing between agents | **Hard** |
| Troops act autonomously | Agents report back, not polled | **Hard** |
| Progression over time | Agent memory/learning | **Very hard** |

## Hard Problem 1: Context Passing

**Problem:** Main agent spawns sub-agent. What context does sub-agent get?

Options:
1. **Full conversation** - Expensive, most is irrelevant
2. **Summary** - Who writes it? Main agent? Auto-generated?
3. **Explicit handoff** - Main agent writes "here's what you need to know"

**CoC equivalent:** When you deploy troops, they know the battlefield. They don't need your full battle history.

**Likely solution:** Main agent provides context string when spawning:

```typescript
spawn_agent({
  task: "Review the auth changes",
  context: "We just refactored login.ts to use JWT instead of sessions. Check for security issues."
})
```

Sub-agent gets context + task, not parent's full conversation.

**Open question:** Should sub-agent be able to READ parent's conversation if needed? Or strict isolation?

## Hard Problem 2: Reporting vs Polling

**Current spec:** Main agent calls `check_agent()` to poll sub-agent status. That's babysitting.

**CoC-like:** Troops report back when something happens. You don't check on each troop constantly.

**Problem:** How does sub-agent "interrupt" main agent?

Options:
1. **Queue system** - Sub-agent pushes to queue, main agent checks queue between turns
2. **Callback injection** - Sub-agent completion triggers message injection into main agent's conversation
3. **Shared state** - Both agents read/write to shared status object

**Likely solution:** After each turn, main agent's runner checks for sub-agent reports:

```typescript
for await (const msg of streamAI(...)) {
  // Normal message handling...

  // Check for sub-agent reports
  const reports = await db.getUnreadReports(runId)
  if (reports.length > 0) {
    // Inject as system message or tool result
    injectSubAgentReports(reports)
  }
}
```

**Open question:** What if sub-agent finishes while main agent is mid-turn? Queue until turn ends? Interrupt?

## Hard Problem 3: Workspace Conflicts

**Problem:** Two agents edit same file simultaneously = corruption.

Options:
1. **File locking** - First agent locks file, second waits or fails
2. **Workspace copies** - Each agent gets isolated copy, merge after
3. **Turn-based** - Only one agent can act at a time (defeats purpose of parallelism)
4. **Semantic merging** - AI-powered merge of conflicting edits

**CoC equivalent:** Troops don't fight over the same tile. They have different targets.

**Likely solution for V2:** Simple file locking with timeout. Agent tries to edit, if locked, waits or picks different task.

**Better solution for V3:** Workspace copies + merge. Each sub-agent works in branch, main agent reviews/merges.

## Hard Problem 4: Budget Enforcement

**Current spec:** No budget enforcement. Agent runs until done or stopped.

**CoC-like:** You have limited elixir. Deploy wisely.

**Problem:** How to enforce token budget mid-run?

SDK gives us `maxBudgetUsd` but that's per-query. We need:
- Budget across entire agent run
- Budget shared across agent + sub-agents
- Warning at 80%, hard stop at 100%

**Likely solution:**

```typescript
interface AgentRun {
  tokenBudget: number
  tokensUsed: number
}

// In runner, after each message:
if (msg.type === 'assistant') {
  const tokens = msg.message.usage.output_tokens
  await db.incrementTokens(runId, tokens)

  const run = await db.get(runId)
  if (run.tokensUsed >= run.tokenBudget) {
    await query.interrupt()
    await db.update(runId, { status: 'budget_exceeded' })
  }
}
```

**Open question:** Should parent's budget include sub-agent usage? Probably yes.

## Hard Problem 5: Agent Memory/Learning

**Problem:** Agent that's done 50 auth fixes should be better than fresh agent.

**CoC equivalent:** Troops don't learn. But this is where AI agents can be better than CoC.

Options:
1. **No memory** - Each run is fresh (current spec)
2. **Session memory** - Resume from previous session (SDK supports this)
3. **Skill memory** - "I've done this before, here's what worked" injected into prompt
4. **Fine-tuning** - Actually train agent on past successes (way future)

**Likely solution for V3:**

```typescript
interface AgentProfile {
  // ... existing ...

  // Memory: summaries of past successful runs
  memories: {
    task: string
    outcome: string
    learnings: string
  }[]
}

// When running, inject relevant memories into system prompt:
const relevantMemories = await findSimilarPastRuns(task, profile.memories)
const systemPrompt = `
${profile.systemPrompt}

You've done similar tasks before:
${relevantMemories.map(m => `- ${m.task}: ${m.learnings}`).join('\n')}
`
```

**Open question:** Who writes the "learnings"? Auto-summarize? User feedback? Main agent review?

## Summary: What to Build When

**V1 (current spec):** Background agents, DB state, SSE streaming. No sub-agents.

**V2:** Sub-agents with:
- Explicit context passing (spawn_agent takes context string)
- Polling via check_agent (simple, not CoC-like but works)
- No file locking (trust agents to not conflict, fix later)
- Parent budget includes children

**V3:** CoC-like with:
- Event-driven reporting (sub-agents push, not polled)
- File locking or workspace branches
- Agent memory/learning

**V4:** Advanced with:
- Semantic merging of workspace conflicts
- Fine-tuned specialist agents
- Multi-user agent coordination (guilds?)

## The One Insight

CoC works because troops are dumb. They follow simple rules, die easily, and you deploy many.

AI agents are smart. They can get stuck in weird ways, need context, and are expensive.

The hard problem isn't "how do we make agents work together." It's "how do we make smart things act dumb enough to be predictable while staying smart enough to be useful."

Constraints help: limited budget, limited scope, clear success criteria. An agent with "fix the auth bug" and 1000 tokens will behave more predictably than one with "make the app better" and unlimited tokens.
