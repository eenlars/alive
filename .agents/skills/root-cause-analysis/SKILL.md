---
name: root-cause-analysis
description: Describe a problem/bug in full detail so it's easier to analyze.
---

# Root Cause Analysis - Problem Description for Expert Consultation

Formulate a problem description that an expert with zero context could diagnose accurately.

## Table of Contents

1. [Purpose](#purpose)
2. [The Oracle Principle](#the-oracle-principle)
3. [Problem Description Template](#problem-description-template)
4. [Finding Dependents](#finding-dependents)
5. [Solution Path Analysis](#solution-path-analysis)
6. [Output Quality](#output-quality)

---

## Purpose

When stuck on a bug, you need to explain it to someone who:
- Has never seen this codebase
- Has no idea what you're building
- Can only help if you give them perfect context

**The oracle can't see the code.** Your description must stand alone.

---

## The Oracle Principle

You're asking an expert oracle for the answer. The oracle will only give you the right answer if you:

1. **Provide complete context** - everything needed to understand the situation
2. **Describe the problem scientifically** - observations, not assumptions
3. **Include slightly more than necessary** - so oracle can spot higher-level issues
4. **Ask the right question** - precise, unambiguous

**Bad question:** "Why doesn't my code work?"
**Good question:** "Given architecture X, when condition Y occurs, result Z happens instead of expected W. What causes the transformation from Y to Z?"

---

## Problem Description Template

### 1. Context (What the oracle doesn't know)

```markdown
## Context

### Architecture
[Describe the relevant system architecture in 3-5 bullet points]
- How components connect
- What data flows where
- What the system is supposed to do

### What We're Building
[1-2 sentences about the product/feature]

### What We Know (That the Oracle Doesn't)
- [Hidden assumption 1]
- [Hidden assumption 2]
- [Recent change that might be relevant]

### The Error/Problem (Detailed)
**What we see:**
[Exact error message, behavior, or symptom]

**When it happens:**
[Exact conditions that trigger it]

**What we expected:**
[What should have happened instead]
```

### 2. The Problem (Precise Location)

```markdown
## Problem Location

### Files Affected
- `path/to/file1.ts` - [role in the problem]
- `path/to/file2.ts` - [role in the problem]

### Functions Affected
- `functionName()` in `file.ts` - [what it does, what's wrong]

### Observations Made
1. [Observation] → [What this tells us]
2. [Observation] → [What this tells us]
3. [Observation] → [What this tells us]
```

### 3. Things We Tried (Learning Journal)

```markdown
## Attempts Made

### Attempt 1: [Name]
- **What we tried:** [Specific action]
- **Why we thought it would work:** [Reasoning]
- **Why it didn't work:** [Result]
- **What we learned:** [Insight]

### Attempt 2: [Name]
- **What we tried:** [Specific action]
- **Why we thought it would work:** [Reasoning]
- **Why it didn't work:** [Result]
- **What we learned:** [Insight]

[Repeat for each attempt]
```

### 4. Current State (Where We Are Now)

```markdown
## Current State

### Assumptions (Not 100% Sure)
- [ ] [Assumption 1] - confidence: X%
- [ ] [Assumption 2] - confidence: X%

### Recent Actions
- Just did: [Most recent action]
- Result: [What happened]

### Current Hypothesis
[What we think might be wrong, but can't prove]
```

### 5. Goal (Success Criteria)

```markdown
## Goal

### How We Measure Success
- [ ] [Specific, measurable outcome 1]
- [ ] [Specific, measurable outcome 2]

### Constraints
- Can't: [Limitation 1 - e.g., "create new packages"]
- Must: [Requirement 1 - e.g., "maintain backward compatibility"]
- Prefer: [Preference 1 - e.g., "reuse existing code"]
```

---

## Finding Dependents

Before describing the problem, map its scope:

### Trace the Error Origin

```bash
# Find where the problematic code is used
grep -r "functionName" --include="*.ts"

# Find imports of the module
grep -r "from.*moduleName" --include="*.ts"

# Find type usages
grep -r "TypeName" --include="*.ts"
```

### Document Dependencies

```markdown
## Dependency Map

### This module depends on:
- `module-a` for [purpose]
- `module-b` for [purpose]

### These modules depend on this:
- `consumer-1` uses [function/type]
- `consumer-2` uses [function/type]

### Potential Ripple Effects
If we change X, it will affect: [list]
```

---

## Solution Path Analysis

Provide leads with confidence levels:

```markdown
## Potential Solutions

### Solution 1: [Name] - Confidence: 70%
**Approach:** [Brief description]
**Pros:** [Why this might work]
**Cons:** [Risks or downsides]
**Effort:** [Small/Medium/Large]

### Solution 2: [Name] - Confidence: 50%
**Approach:** [Brief description]
**Pros:** [Why this might work]
**Cons:** [Risks or downsides]
**Effort:** [Small/Medium/Large]

### Solution 3: [Name] - Confidence: 30%
**Approach:** [Brief description]
**Pros:** [Why this might work]
**Cons:** [Risks or downsides]
**Effort:** [Small/Medium/Large]
```

**Adjust confidence** as you learn new information.

---

## Output Quality

### The Patrick Collison Test

Write as if Patrick Collison is explaining to Elon Musk:
- **Immediately clear** - no re-reading needed
- **No fluff** - every sentence earns its place
- **Intelligent** - shows you've done the thinking
- **Researched** - backed by observations, not guesses

### The Closing Request

End every problem description with:

> "After your analysis and root cause finding + fix + explanation why, I want you to ask two questions that, if answered, would most likely solve this problem in the long term, rather than being a quick fix."

This prompts systemic thinking over band-aids.

---

## Quick Template

For simpler bugs, use this condensed version:

```markdown
## Problem
[One sentence: what's wrong]

## Context
- Architecture: [how it works]
- Trigger: [when it breaks]
- Expected: [what should happen]
- Actual: [what happens instead]

## Tried
1. [Action] → [Result] → [Learned]
2. [Action] → [Result] → [Learned]

## Hypothesis
[What I think is wrong: X%]

## Ask
Root cause + fix + two questions for long-term solution.
```

---

## Anti-Patterns

| Don't | Do Instead |
|-------|------------|
| "It doesn't work" | "When X, Y happens instead of Z" |
| Assume the oracle knows your code | Describe architecture from scratch |
| Skip what you tried | Document every attempt and learning |
| Guess without stating confidence | "I think X (60% confident)" |
| Ask for "the fix" | Ask for "root cause + why + long-term" |
