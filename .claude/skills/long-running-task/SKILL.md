---
name: Long-Running Task Orchestrator
description: Guide lessons for long-running coding tasks with little human steering. Harness design, test ladders, parallel agents, context management, and failure prevention.
---

# Long-Running Task Orchestrator

Guide for structuring and executing long-running coding tasks with minimal human steering. These are hard-won lessons about what actually works when agents run autonomously for extended periods.

## Table of Contents

1. [Treat the Harness as the Product](#1-treat-the-harness-as-the-product)
2. [Write a Tight Task Contract](#2-write-a-tight-task-contract)
3. [Make Runs Hermetic and Repeatable](#3-make-runs-hermetic-and-repeatable)
4. [Force Progress via Auto-Loop, Reset Context Aggressively](#4-force-progress-via-auto-loop-reset-context-aggressively)
5. [Engineer Output for Model Cognition](#5-engineer-output-for-model-cognition)
6. [Build a Test Ladder, Not One Big Test](#6-build-a-test-ladder-not-one-big-test)
7. [Use Differential Testing for Monolith Targets](#7-use-differential-testing-for-monolith-targets)
8. [Design for Parallelism Explicitly](#8-design-for-parallelism-explicitly)
9. [Specialize Agents into Narrow Roles](#9-specialize-agents-into-narrow-roles)
10. [Put Hard Gates in CI to Stop Entropy](#10-put-hard-gates-in-ci-to-stop-entropy)
11. [Optimize for Fast Feedback First](#11-optimize-for-fast-feedback-first)
12. [Expect Ceilings and Plan Controlled Fallbacks](#12-expect-ceilings-and-plan-controlled-fallbacks)
13. [Security and Operational Safety](#13-security-and-operational-safety)
14. [Minimal Blueprint](#minimal-blueprint)
15. [Failure Modes to Design Against](#failure-modes-to-design-against)

---

## 1. Treat the Harness as the Product

Optimize the environment around the model, not the prompt.

- Assume the agent will "solve the verifier," not your intention.
- Invest most effort into: **reproducibility, tests, feedback format, and gates.**
- The harness IS the guardrail. If the harness is weak, the agent will find the gap.

---

## 2. Write a Tight Task Contract

The agent cannot misread what is mechanically enforced.

**Pin "done" to measurable artifacts:**
- Binaries built
- Test suites passed
- Targets supported
- Performance budgets met

**State explicit non-goals and allowed crutches** (external compiler, external assembler, etc.) so "cheating" is controlled rather than accidental.

**Encode constraints mechanically (CI checks), not socially (prompt admonitions).**

| Contract Element | Bad | Good |
|------------------|-----|------|
| Definition of done | "Make it work" | "All Tier 0-3 tests green, binary under 2MB" |
| Constraints | "Don't use hacks" | CI rejects `// @ts-ignore`, lint gate blocks merge |
| Non-goals | (unstated) | "x86 real-mode not in scope, use fallback assembler" |
| Allowed shortcuts | (unstated) | "May shell out to GCC for linking until Tier 4 green" |

---

## 3. Make Runs Hermetic and Repeatable

- Containerize everything; no access to host machine; least privileges.
- Freeze toolchain versions; lock dependencies; hash inputs.
- Make every failure reproducible with:
  - A **single command**
  - A **fixed seed**
  - **Captured logs + artifacts**

```bash
# Ideal: any failure can be reproduced like this
./scripts/repro_fail <failure-id>
# Pulls the exact container, seed, inputs, and replays
```

**If a failure can't be reproduced, it can't be fixed.** Design for this from day one.

---

## 4. Force Progress via Auto-Loop, Reset Context Aggressively

Use short-lived sessions; restart from clean containers.

**Persist state in the repo, not in chat history:**

| File | Purpose |
|------|---------|
| `README.md` | How to run + current status |
| `PROGRESS.md` | What's done, what's broken, next tasks |
| `KNOWN_FAILURES.md` | Failed attempts and why |

**Design for "drop-in amnesia":** a fresh agent must orient itself fast. If an agent can't figure out what to do next by reading three files, the repo conventions are broken.

```markdown
<!-- PROGRESS.md example -->
## Current Status
- Tier 0-2: GREEN (847/847 passing)
- Tier 3: 94% (12 failures, see KNOWN_FAILURES.md)
- Tier 4: BLOCKED on linker issue #47

## Next Tasks (priority order)
1. Fix string literal parsing edge case (Tier 3 failures 1-8)
2. Implement missing relocations for ARM (Tier 3 failures 9-12)
3. Unblock Tier 4 by resolving linker issue #47
```

---

## 5. Engineer Output for Model Cognition

Agents drown in verbose output. Design logs for their limitations.

### Prevent context-window pollution
- Default to **brief stdout**
- Write full logs to **files**
- Print only the **first N and last N** relevant lines

### Make logs grep-friendly and machine-summarized
```
ERROR: PARSER - unexpected token at line 47 of input.c
ERROR: CODEGEN - register allocation overflow in func_big()
SUMMARY: 842 passed, 5 failed, 0 skipped
TOP_ERRORS: PARSER(3), CODEGEN(2)
```

- One-line failure headers: `ERROR: <category> - <short cause>`
- Deterministic paths to detailed traces
- Aggregate counts precomputed (passes/fails, top error classes)

### Make time blindness survivable
- A `--fast` mode (1%-10% deterministic sample)
- Infrequent progress markers
- Hard timeouts per test shard

---

## 6. Build a Test Ladder, Not One Big Test

Layer tests so agents get rapid signal early and deep signal later.

| Tier | What | Speed | Purpose |
|------|------|-------|---------|
| **0** | Formatting, lint, compile checks | Seconds | Catch garbage fast |
| **1** | Unit tests + golden tests for small components | Seconds | Core correctness |
| **2** | Property tests + fuzzing for parsers/IR/transforms | Minutes | Edge cases |
| **3** | Differential tests against an oracle | Minutes | Correctness vs reference |
| **4** | Real-world builds (multiple external projects) | 10+ min | Integration proof |
| **5** | Full-system target (kernel / monorepo / massive build) | Hours | End-to-end validation |

**Key lesson:** Late-stage regressions spike unless the ladder is strict and always-on. Never skip lower tiers to "save time."

```bash
# Fast feedback (run constantly)
./scripts/test_fast     # Tier 0-1, < 30 seconds

# Full validation (run before merge)
./scripts/test_full     # Tier 0-3, < 10 minutes

# Deep validation (scheduled)
./scripts/test_deep     # Tier 0-5, hours
```

---

## 7. Use Differential Testing for Monolith Targets

When the "real target" is one giant build (kernel-class), parallel agents converge on the same bug and thrash.

**The unlock:**
1. Introduce an **oracle** (e.g., GCC/Clang, reference interpreter)
2. Compile most files with the oracle, a **subset** with your system
3. **Bisect** the subset to localize failures
4. Add **delta-debugging** to catch interaction bugs (pairs/groups that fail together but pass alone)

This converts a monolith into many independent, parallelizable bug hunts.

```bash
# Example: bisect which files cause the build to fail
./scripts/bisect_failures --oracle=gcc --system=our-compiler --target=linux-kernel
# Output: "Files causing failure: fs/ext4/inode.c, mm/page_alloc.c"
```

---

## 8. Design for Parallelism Explicitly

Parallelism works only if tasks are separable and ownership is enforced.

### Repo-level work queue
```
current_tasks/
├── fix-parser-edge-case.txt      # Claimed by agent-1
├── implement-arm-relocs.txt      # Claimed by agent-2
└── available/
    ├── optimize-register-alloc.txt
    └── add-debug-info-support.txt
```

- Task claim via lock files
- Claim is atomic through git push/pull and conflict
- Release lock only after merge + green checks

### Keep tasks small and typed

| Good Task | Bad Task |
|-----------|----------|
| "Fix failing test X" | "Improve the compiler" |
| "Implement feature Y behind flag" | "Make things faster" |
| "Refactor duplicate module Z" | "Clean up the codebase" |

**Avoid "everyone edits the same core file"** work by modular boundaries and feature flags.

---

## 9. Specialize Agents into Narrow Roles

Parallel agents are valuable when they stop duplicating work.

| Role | Mandate | Scope |
|------|---------|-------|
| **Feature implementer** | New capabilities behind flags | Own feature directory |
| **Bug miner** | Chase top failing tests; minimal code changes | Test files + targeted fixes |
| **Regression sheriff** | Bisect regressions, revert bad commits | KNOWN_FAILURES + git history |
| **Refactor/quality** | Remove duplication, improve structure | Reduce merge conflicts |
| **Performance** | Benchmarks + hotspots + low-risk optimizations | Perf-critical paths only |
| **Docs/orientation** | Keep runbooks accurate; keep onboarding fast | Markdown files only |

**Make roles enforceable via CI labels, directories, or ownership rules** — not just prompts.

---

## 10. Put Hard Gates in CI to Stop Entropy

Autonomous iteration trends toward "fix one thing, break two."

- **Require green on the full ladder** for merge to main (or staged gates)
- **Add regression tests immediately** after any bug fix
- **Freeze interfaces;** forbid broad refactors unless paired with extra tests
- **Merge conflict discipline:**
  - Rebase/merge strategies standardized
  - Automatic formatting to reduce diff noise

| Gate | When | Blocks |
|------|------|--------|
| Tier 0-1 | Every commit | Push |
| Tier 0-3 | Every PR | Merge |
| Tier 0-4 | Nightly | Release |
| Tier 0-5 | Weekly | Milestone |

---

## 11. Optimize for Fast Feedback First

Agents waste compute on long runs if the harness allows it.

- Default command should finish **quickly**
- Cache build artifacts, shard test suites, parallelize within the container
- Make "expensive verification" **opt-in** and scheduled (nightly) unless close to release

```bash
# BAD: agent's default test command takes 45 minutes
bun run test:all

# GOOD: agent's default test command takes 30 seconds
bun run test:fast
# Full suite is explicit and gated
bun run test:full --shard=1/4
```

---

## 12. Expect Ceilings and Plan Controlled Fallbacks

Some components are disproportionately hard (toolchain edges, real-mode x86, linker/assembler correctness, whole-program optimization).

**Allow scoped fallbacks explicitly:**
- Clear boundaries (which files/features use the fallback)
- Tracking issues (when will the fallback be replaced)
- Tests that prevent fallback creep (regression if fallback scope grows)

**Measure "distance to replacement":**
```markdown
## Fallback Status
| Component | Fallback To | Files Affected | Tracking |
|-----------|-------------|----------------|----------|
| Linker | GNU ld | 100% of builds | #47 |
| Assembler | NASM | 12 files | #52 |
| Float math | libm | 3 functions | #61 |
```

Progress is only real if the fallback scope is shrinking.

---

## 13. Security and Operational Safety

Long-running autonomous code generation is a supply-chain risk factory unless contained.

**Non-negotiable:**
- No host access, no secrets, no prod credentials
- Network off by default; allowlisted access only when required
- Resource limits: CPU/mem/disk; kill switch; audit logs
- Artifact review mode for releases: reproducible build + signed outputs + provenance

---

## Minimal Blueprint

Repo conventions that work for long-running autonomous tasks:

```
project/
├── README.md              # One-command build/test, environment, quickstart
├── PROGRESS.md            # Current pass rates, top blockers, next tasks
├── KNOWN_FAILURES.md      # Failure patterns, dead ends, links to tests
├── current_tasks/         # Lock files for task claims
├── scripts/
│   ├── test_fast          # Tier 0-1, seconds
│   ├── test_full          # Tier 0-3, minutes
│   ├── repro_fail <id>    # Reproduce specific failure
│   └── summarize_logs     # Machine-readable failure summary
└── ci/
    ├── gates.yml          # Strict merge gates
    ├── seeds.txt          # Deterministic seeds
    └── artifacts/         # Upload on failure
```

---

## Failure Modes to Design Against

These are the ways long-running autonomous tasks die. Design against all of them.

| Failure Mode | What Happens | Prevention |
|--------------|--------------|------------|
| **Verifier gaps** | Agent "solves the wrong thing" | Tight task contract, measurable artifacts |
| **Output spam** | Context collapse, random thrashing | Brief stdout, logs to files, summaries |
| **Monolithic target** | Agents duplicate work, overwrite each other | Differential testing, bisection |
| **Weak gates** | Regressions accumulate until progress stops | Strict CI, immediate regression tests |
| **No reproducibility** | Failures become unfixable | Hermetic runs, fixed seeds, single-command repro |
| **No role boundaries** | Parallelism becomes merge-conflict farming | Narrow mandates, directory ownership, lock files |

---

## When to Use This Skill

Use this when:
- A task will take **multiple sessions** or **hours of autonomous work**
- You need to **structure a repo** for agent-friendly long-running development
- You're setting up **parallel agents** and need to prevent thrashing
- Progress is stalling and you suspect **harness problems, not model problems**
- You need to audit whether a long-running task setup is **robust or fragile**

**The core insight:** Most long-running task failures are harness failures, not model failures. Fix the harness first.
