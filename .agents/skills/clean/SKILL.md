---
name: Clean Code
description: Clean up the code and make it PR ready.
---

# Clean Code - PR Readiness Checklist

Make code review-ready by cleaning up what was just written. No git commands.

## Table of Contents

1. [Core Principles](#core-principles)
2. [File Audit Checklist](#file-audit-checklist)
3. [Code Quality Checks](#code-quality-checks)
4. [Naming & Structure](#naming--structure)
5. [Documentation Rules](#documentation-rules)
6. [Forbidden Patterns](#forbidden-patterns)
7. [Final Verification](#final-verification)

---

## Core Principles

- **Code speaks for itself** - minimize comments, maximize clarity
- **Outsider test** - would someone new understand this in 30 seconds?
- **No leftovers** - remove debug logs, unused imports, temporary files
- **Right place, right name** - every file belongs somewhere specific

---

## File Audit Checklist

**Before cleaning, identify what was changed:**

```
Which files did I create?
Which files did I modify?
Are there any temporary files to remove?
```

If unclear, ask the user to provide the list of edited files.

### Files to Check

| Check | Action |
|-------|--------|
| New files at directory root | Move to proper location |
| `.md` files at project root | Delete unless intentional |
| `index.ts` files | Only allowed in `shared/` folder |
| Zod schemas loose in code | Move to `contracts/`, `shared/`, or `lib/schemas/` |
| Unused imports | Remove |
| Console.logs / debuggers | Remove |

---

## Code Quality Checks

### TypeScript Strictness

```typescript
// BAD - type escape hatches
const data: any = response
const result = value as SomeType

// GOOD - proper typing
const data: ResponseType = response
const result: SomeType = validateAndParse(value)
```

**Zero tolerance for:**
- `any` types (use `unknown` + type guards)
- Type assertions (`as`) without validation
- `@ts-ignore` or `@ts-expect-error` without explanation

### Variable Clarity

```typescript
// BAD - ambiguous
const d = new Date()
const arr = items.filter(x => x.active)
const temp = process(data)

// GOOD - self-documenting
const createdAt = new Date()
const activeItems = items.filter(item => item.active)
const processedUser = processUserData(rawUserData)
```

### Function Quality

```typescript
// BAD - unclear purpose
function handle(x, y, z) { ... }

// GOOD - explicit contract
function calculateTotalPrice(
  items: CartItem[],
  discount: Discount,
  taxRate: number
): number { ... }
```

---

## Naming & Structure

### File Names

| Pattern | Example | When to Use |
|---------|---------|-------------|
| `kebab-case.ts` | `user-service.ts` | Most files |
| `PascalCase.tsx` | `UserProfile.tsx` | React components |
| `SCREAMING_SNAKE.ts` | `CONSTANTS.ts` | Constants only |

### Directory Structure

```
feature/
├── components/      # UI components
├── hooks/          # React hooks
├── lib/            # Business logic
│   └── schemas/    # Zod schemas for this feature
├── types/          # TypeScript types
└── index.ts        # Public exports (if in shared/)
```

### Common Mistakes

| Mistake | Fix |
|---------|-----|
| File at top of random directory | Find the right feature folder |
| Logic in component file | Extract to `lib/` |
| Types scattered everywhere | Consolidate in `types/` |
| Schema in business logic | Move to `schemas/` |

---

## Documentation Rules

### When Comments Are Needed

```typescript
// GOOD - explains WHY, not WHAT
// We retry 3 times because the upstream API has intermittent failures
const MAX_RETRIES = 3

// GOOD - documents non-obvious behavior
// Returns null instead of throwing to allow graceful fallback
function safeParseJSON(input: string): object | null { ... }
```

### When Comments Are Noise

```typescript
// BAD - states the obvious
// Increment counter
counter++

// BAD - restates the code
// Get user by ID
const user = getUserById(id)

// BAD - outdated/misleading
// TODO: Remove this hack (from 2019)
```

### JSDoc for Public APIs

```typescript
/**
 * Calculates shipping cost based on weight and destination.
 * @param weight - Package weight in kilograms
 * @param destination - ISO country code
 * @returns Cost in cents, or null if destination not supported
 */
export function calculateShipping(weight: number, destination: string): number | null
```

---

## Forbidden Patterns

| Pattern | Why It's Bad | What to Do Instead |
|---------|--------------|-------------------|
| `// @ts-ignore` | Hides real errors | Fix the type |
| `any` | Defeats TypeScript | Use `unknown` + guard |
| `as Type` (unsafe) | Runtime crashes | Validate first |
| `console.log` | Debug noise | Remove or use logger |
| Magic numbers | Unclear intent | Named constants |
| Commented-out code | Dead weight | Delete it |
| `TODO` without owner | Never gets done | Add name + date |

---

## Final Verification

Run through this checklist before marking as done:

### Structure
- [ ] No new files dumped at directory root
- [ ] No orphan `index.ts` outside `shared/`
- [ ] Zod schemas in correct locations
- [ ] File names follow conventions

### Code
- [ ] No `any` types
- [ ] No unsafe type assertions
- [ ] No console.logs or debuggers
- [ ] No unused imports
- [ ] Variables have clear names
- [ ] Functions have explicit types

### Documentation
- [ ] No `.md` files at project root (unless intentional)
- [ ] Comments explain WHY, not WHAT
- [ ] Public APIs have JSDoc

### Final Test
- [ ] Would an outsider understand this code?
- [ ] Would this pass a strict code review?

---

## Quick Commands

```bash
# Check for any types
grep -r ": any" --include="*.ts" --include="*.tsx"

# Find console.logs
grep -r "console.log" --include="*.ts" --include="*.tsx"

# Find ts-ignore
grep -r "@ts-ignore" --include="*.ts" --include="*.tsx"
```

**Remember:** Code that needs comments to be understood is code that needs rewriting.
