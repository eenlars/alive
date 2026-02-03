---
name: Reflect
description: reflect on recent work and clean up code for PR readiness
---

# Reflect on Work - Self-Review Protocol

Stop. Look at what you just built. Did you actually do it right?

## Table of Contents

1. [The Reflection Loop](#the-reflection-loop)
2. [Quality Questions](#quality-questions)
3. [Code Audit](#code-audit)
4. [Common Self-Deceptions](#common-self-deceptions)
5. [Verification Checklist](#verification-checklist)
6. [Cleanup Actions](#cleanup-actions)

---

## The Reflection Loop

Before declaring "done", run through this:

```
1. Re-read user's original request
2. List what you actually delivered
3. Identify gaps between request and delivery
4. Find shortcuts you took
5. Fix immediately - don't wait
```

**Key rule:** If you find issues, fix them now. Don't stop to ask - continue immediately.

---

## Quality Questions

### Did You Actually Finish?

| Question | Red Flag Answer |
|----------|-----------------|
| Did you complete everything asked? | "Most of it" |
| Does the code work? | "It should" |
| Can you prove it works? | "I think so" |
| Would this pass code review? | "Probably" |

**If any answer is vague, you're not done.**

### Architecture Check

- Did you create workarounds that shouldn't exist?
- Are there shortcuts that will cause problems later?
- Does this code fit with existing patterns?
- Will this break other code that uses it?

### Maintainability Check

- Is the file size reasonable? (>300 lines = probably split it)
- Would another developer understand this code?
- Could they modify it without breaking things?
- Did you actually understand what you wrote?

---

## Code Audit

### What to Check

```
1. Which files did I create?
2. Which files did I modify?
3. What temporary changes did I make?
4. What did I leave unfinished?
```

**If unclear what was edited, ask the user.**

### File Placement Audit

| Issue | Fix |
|-------|-----|
| New file at directory root | Move to proper feature folder |
| `index.ts` outside `shared/` | Remove or relocate |
| `.md` at project root | Delete unless intentional |
| Zod schema in wrong place | Move to `contracts/`, `shared/`, or `lib/schemas/` |

### Code Quality Audit

| Issue | Fix |
|-------|-----|
| `any` type | Replace with proper type |
| `as` assertion | Add validation |
| Unclear variable name | Rename to be self-documenting |
| Unused import | Delete |
| Console.log | Remove |

---

## Common Self-Deceptions

### "It Works"

**Reality check:** Did you test it? Or did you just write it and assume?

```
Can you PROVE it works?
- Did you run the code?
- Did you check edge cases?
- Did you verify the happy path?
```

### "It's Simple Enough"

**Reality check:** Simple for you right now, or simple for someone seeing it fresh?

```
The outsider test:
- No context about why decisions were made
- No memory of the conversation
- Would they understand in 30 seconds?
```

### "I'll Clean It Up Later"

**Reality check:** You won't. Clean it now.

```
Later never comes:
- Technical debt compounds
- Context fades
- Shortcuts become permanent
```

---

## Verification Checklist

### Completeness

- [ ] Every item in user's request addressed
- [ ] No partial implementations
- [ ] No "TODO" comments left behind
- [ ] No placeholder values

### Quality

- [ ] No `any` types
- [ ] No unsafe type assertions
- [ ] Variables clearly named
- [ ] Functions properly typed
- [ ] No console.logs

### Structure

- [ ] Files in correct locations
- [ ] No orphan `index.ts` files
- [ ] Schemas in proper folders
- [ ] No `.md` files at root

### Proof

- [ ] Can demonstrate it works
- [ ] Edge cases considered
- [ ] Error handling exists
- [ ] Would survive code review

---

## Cleanup Actions

### Run These Checks

```bash
# Lint the code
bun run lint

# Type check
bun run type-check

# Find any types
grep -r ": any" --include="*.ts" --include="*.tsx"

# Find console.logs
grep -r "console.log" --include="*.ts" --include="*.tsx"
```

### Fix Categories

**Immediate fixes** (do now):
- Type errors
- Lint errors
- Missing error handling
- Unclear names

**File reorganization** (if needed):
- Misplaced files
- Orphan index.ts
- Loose schemas

**Documentation** (minimal):
- JSDoc for public APIs
- Comments only for WHY, not WHAT

---

## Final Rule

**If you find issues during reflection - FIX THEM IMMEDIATELY.**

Don't:
- Stop to ask permission
- Defer to "later"
- Rationalize why it's fine
- Declare done with known issues

Do:
- Fix it now
- Keep going until it's actually done
- Prove it works, don't just state it

**The work isn't done until an outsider could understand it, maintain it, and verify it works.**
