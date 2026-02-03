# Vision

## The Unlock

A solo founder launches a regulated fintech product in 3 months — with full legal compliance across 5 countries.

Today this requires: a compliance team, lawyers in each jurisdiction, a dev team to build the product, someone to handle translations, customer support staff, and probably a year of back-and-forth with regulators.

Tomorrow: One person prompts an AI to draft the product, another to research regulatory requirements in each market, another to prepare and file the paperwork, another to build localized customer support flows, another to monitor for regulatory changes and flag issues.

Each "another" is an agent, not a hire.

The founder's job becomes orchestration and judgment calls — not execution of every step.

This specific thing (regulated, multi-jurisdiction, solo) is currently impossible. The coordination cost alone kills it. But when coordination cost drops to near zero, it becomes a weekend project.

## The Core Constraint

**Agents do exactly what they promise. No mistakes.**

This is the only thing that matters. Everything else follows from it.

- Can't promise what it can't verify
- Must know when to STOP, not try and break things
- Small scope = verifiable scope

An agent with "fix the auth bug" and 1000 tokens will behave more predictably than one with "make the app better" and unlimited tokens.

## The Game

You're running a startup. But your employees are AI agents.

Define outcomes. Spawn agents. Watch them work in parallel. Review at gates. Ship.

Not "impressive demo." Not "watch the AI try."

Real customers. Real code. Real money.

## The Feeling

You define an outcome: "Launch payments in Germany, France, UK, US, Singapore."

The system breaks this into verifiable sub-outcomes:
- Legal research agent (DE) → `requirements.de.md` with citations
- Legal research agent (FR) → `requirements.fr.md` with citations
- Legal research agent (UK) → `requirements.uk.md` with citations
- ...

You go to sleep. Wake up. Check the dashboard.

5 requirements docs complete. All verified against acceptance criteria. Product agent waiting for your approval to start building.

You review. Approve. Go back to your life.

That evening: MVP code complete. Test suite passing. Filing agents preparing applications.

You didn't write the code. You didn't read the regulations. You didn't draft the filings.

You defined the outcome and made judgment calls at gates.

That's the feeling.

## Why It Works

### Outcome Contracts

Agents don't get vague instructions. They get:
- Clear success criteria
- Verifiable output artifacts
- Acceptance tests they run themselves

```
Task: "Research German fintech requirements"
Output: requirements.de.md
Acceptance:
  - All BaFin requirements listed
  - Each requirement has regulatory citation
  - No placeholders or TODOs
```

### Self-Verification

Agents know when they're done because they prove it.

Not "I think I'm done." Not "looks good to me."

The agent runs its acceptance criteria against its output. Reports verified or blocked. Human reviews verified work, not work-in-progress.

### Reporting, Not Polling

Agents push completion events. You don't babysit.

- Agent finishes → pushes to queue
- Orchestrator processes queue
- Human notified at gates only

This is what makes coordination cost drop to near zero.

### Parallel Execution

Independent tasks run simultaneously. The system handles:
- Workspace isolation (no conflicts)
- Artifact handoffs between phases
- Dependency ordering (Phase 2 waits for Phase 1)

5 legal research agents. Running in parallel. Each in their own workspace. Results merged when all complete.

## The Architecture

```
User defines outcome
       ↓
Orchestrator breaks into sub-outcomes with acceptance criteria
       ↓
Spawn parallel agents (each with own workspace)
       ↓
Agents work → self-verify → report completion
       ↓
Orchestrator validates artifacts
       ↓
If all valid → spawn next phase with merged context
If blocked → human makes judgment call
       ↓
Repeat until outcome achieved
```

Human involvement: outcome definition, gate approvals, judgment calls.

Everything else: agents.

## What Makes This Different

**"AI Employee" platforms:**
Lindy, Relevance AI, Ema — enterprise dashboards. Complex. Boring. Require constant supervision.

**Multi-agent frameworks:**
CrewAI, Microsoft Agent Framework — developer tools. Infrastructure. Build-it-yourself.

**Us:**
Opinionated system where agents do exactly what they promise. Verified outputs. Parallel execution. Near-zero coordination cost.

| Others | Us |
|--------|-----|
| "Watch the AI try" | Agents verify their own work |
| Polling and babysitting | Reporting and gates |
| Vague prompts, vague results | Outcome contracts with acceptance criteria |
| Demo-ware that breaks | Actually works, every time |
| Sequential execution | Parallel agents, merged results |

## The Primitives

Three things make this work:

### 1. Outcome Contracts
Define success before starting. Include acceptance criteria the agent can verify itself.

### 2. Verified Artifacts
Not just "here's a document" but "here's a document + proof it meets criteria."

### 3. Structured Handoffs
Agents pass artifacts to next phase with explicit context. No "figure out what happened."

## What We're Building

A system where you define outcomes and agents deliver verified results.

The coordination cost that makes "solo founder, 5 countries, 3 months" impossible today?

We're making it near-zero.

That's the vision.
