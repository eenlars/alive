---
name: fix-bug-when-stuck
description: This skill helps you explain a problem you're stuck on for a longer time and get back to the root of the problem.
---

# Fix Bug When Stuck - Structured Problem Escalation

When you've been spinning on a bug for too long, use this framework to reset and explain it to a "dumb agent" who can help.

## Table of Contents

1. [When to Use This](#when-to-use-this)
2. [The Dumb Agent Principle](#the-dumb-agent-principle)
3. [Output Structure](#output-structure)
4. [Writing Guidelines](#writing-guidelines)
5. [The Closing Questions](#the-closing-questions)

---

## When to Use This

Use this skill when:
- You've tried 3+ approaches and none worked
- You're going in circles
- The fix "should work" but doesn't
- You can't explain why it's broken

**Signs you're stuck:**
- Re-trying the same approach with small variations
- Saying "this makes no sense"
- Getting frustrated
- Losing track of what you've tried

---

## The Dumb Agent Principle

You're explaining to someone who:
- Has **zero knowledge** of this codebase
- Has **zero knowledge** of the problem
- Has **zero context** about what you're building
- Can **only help** if you give them perfect information

**The fix is usually simple.** The hard part is finding it. To find it, you need fresh eyes. To get fresh eyes, you need to explain from scratch.

---

## Output Structure

### 1. Context

**What the dumb agent doesn't know:**

```markdown
## Context

### Architecture
[Bullet points explaining how the relevant parts connect]
- Component A does X
- Component B receives Y from A
- Data flows: A → B → C

### What We're Building
[One sentence: what is this product/feature?]
A tool to make it easy to create 'backends' which are actually agentic workflows.

### Design Philosophy
Every line of code should make sense. No magic.

### The Error/Symptom (Exact Details)
**What we see:**
[Exact error message or unexpected behavior - copy/paste if possible]

**When it happens:**
[Exact steps to reproduce]

**What we expected:**
[What should have happened]
```

### 2. The Problem

**Precise location:**

```markdown
## The Problem

### Files Affected
| File | Role in Problem |
|------|-----------------|
| `path/to/file1.ts` | Contains the broken function |
| `path/to/file2.ts` | Calls the broken function |

### Functions Affected
| Function | File | What's Wrong |
|----------|------|--------------|
| `doThing()` | `file1.ts` | Returns undefined when X |
| `handleResult()` | `file2.ts` | Doesn't handle undefined |

### Observations
1. When I log X, I see Y → This tells me Z
2. When I remove line N, behavior changes to W
3. The same input works in test but fails in prod
```

### 3. Things We Tried

**Per attempt - be honest about assumptions:**

```markdown
## What We Tried

### Attempt 1: [Name]
- **Action:** [What we did]
- **Assumption:** [Why we thought this would work]
- **Result:** [What happened]
- **Learning:** [What this tells us]

### Attempt 2: [Name]
- **Action:** [What we did]
- **Assumption:** [Why we thought this would work]
- **Result:** [What happened]
- **Learning:** [What this tells us]

### Attempt 3: [Name]
- **Action:** [What we did]
- **Assumption:** [Why we thought this would work]
- **Result:** [What happened]
- **Learning:** [What this tells us]
```

### 4. Current State

**Where we are now:**

```markdown
## Current State

### Unverified Assumptions
Things I believe but can't prove:
- [ ] X is happening before Y (70% sure)
- [ ] The config is being read correctly (50% sure)
- [ ] No race condition (40% sure)

### Most Recent Action
- Just did: [Action]
- Result: [What happened]
- Now thinking: [Current hypothesis]

### Gut Feeling
[What I think is wrong, even if I can't prove it]
The fix is probably simple - likely X, but I haven't looked at Y enough.
```

### 5. Goal

**How we'll know it's fixed:**

```markdown
## Goal

### Success Criteria
- [ ] [Specific measurable outcome 1]
- [ ] [Specific measurable outcome 2]
- [ ] Existing tests pass
- [ ] No regressions

### Constraints
- Prefer: Reusing existing code
- Avoid: Creating new modules unless necessary
- Must: Maintain backward compatibility
```

---

## Writing Guidelines

### The Patrick Collison → Elon Musk Standard

Write as if Patrick Collison is explaining to Elon Musk:

| Quality | Meaning |
|---------|---------|
| **Immediately clear** | No re-reading needed |
| **No fluff** | Every word earns its place |
| **Intelligent** | Shows you've done the thinking |
| **Researched** | Based on observations, not vibes |
| **Honest** | States uncertainty explicitly |

**Elon spots fake intelligence immediately.** Don't pretend you know more than you do.

### Language Tips

| Don't Say | Say Instead |
|-----------|-------------|
| "It doesn't work" | "When X, result is Y instead of Z" |
| "I tried everything" | "I tried A, B, C. Each failed because..." |
| "It should work" | "Based on X, I expected Y, but got Z" |
| "I think the problem is..." | "I suspect X (60% confident) because..." |

---

## The Closing Questions

**Always end with this request:**

> "After your analysis and root cause finding + fix + explanation why, I want you to ask two questions that, if answered, would most likely solve this problem in the long term, rather than being a short quick fix."

This ensures you get:
1. The immediate fix
2. The root cause explanation
3. Two questions that prevent similar bugs

---

## Quick Template

For faster escalation:

```markdown
## Problem
[One line: what's broken]

## Context
- Building: [what]
- Architecture: [how relevant parts connect]
- Error: [exact symptom]

## Tried
1. [Action] → [Failed because] → [Learned]
2. [Action] → [Failed because] → [Learned]
3. [Action] → [Failed because] → [Learned]

## State
- Unsure about: [list uncertainties with confidence %]
- Gut feeling: [what I think is wrong]

## Goal
- Success looks like: [measurable outcome]

---
After root cause + fix, ask me two questions for long-term prevention.
```

---

## Remember

- **The fix is usually simple** - finding it is hard
- **Fresh eyes need fresh context** - explain from zero
- **Be honest about uncertainty** - guessing wastes time
- **Did you look around enough?** - sometimes the answer is nearby
