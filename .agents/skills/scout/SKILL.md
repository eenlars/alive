---
name: Dependency Scout
description: Map and analyze code dependencies to identify potential impact before making changes
---

# Dependency Scout - Impact Analysis Before Changes

Understand the ripple effects of code changes before you make them. Map dependencies, assess blast radius, prevent catastrophic breaks.

## Table of Contents

1. [Purpose](#purpose)
2. [Dependency Mapping](#dependency-mapping)
3. [Impact Analysis](#impact-analysis)
4. [Risk Assessment](#risk-assessment)
5. [Scout Workflow](#scout-workflow)
6. [Output Format](#output-format)
7. [Common Scenarios](#common-scenarios)

---

## Purpose

Before changing any code, answer these questions:
- What depends on this code?
- What does this code depend on?
- How many files could break if I change this?
- Are there tests covering the impact area?

**The Scout prevents:** "I only changed one file, why did 47 things break?"

---

## Dependency Mapping

### What to Trace

| Type | What to Find | How to Find |
|------|--------------|-------------|
| **Imports** | Who imports this module | `grep -r "from.*moduleName"` |
| **Exports** | What this module exposes | Check `export` statements |
| **Function calls** | Where functions are used | `grep -r "functionName("` |
| **Type usage** | Where types are referenced | `grep -r "TypeName"` |
| **Config references** | What config keys are used | `grep -r "CONFIG\."` |

### Commands for Mapping

```bash
# Find all imports of a module
grep -r "from.*@webalive/shared" --include="*.ts" --include="*.tsx"

# Find where a function is called
grep -r "processUser(" --include="*.ts"

# Find type usage
grep -r ": UserType" --include="*.ts"

# Find exports from a file
grep "export" path/to/file.ts

# Find all files that could be affected
grep -rl "moduleName" --include="*.ts" | wc -l
```

### Mapping Checklist

- [ ] Direct imports (files that `import` from this module)
- [ ] Re-exports (files that re-export this module)
- [ ] Type consumers (files using types from this module)
- [ ] Function callers (files calling functions from this module)
- [ ] Config consumers (files reading config this module affects)
- [ ] Test files (tests that cover this module)

---

## Impact Analysis

### Downstream Effects (What Breaks If I Change This)

```markdown
## Downstream Impact

### Direct Dependents (1 hop)
Files that directly import this module:
- `consumer-a.ts` - uses `functionX`
- `consumer-b.ts` - uses `TypeY`

### Indirect Dependents (2+ hops)
Files that depend on the direct dependents:
- `page-a.tsx` imports `consumer-a.ts`
- `api-handler.ts` imports `consumer-b.ts`

### Total Blast Radius
- Direct: 5 files
- Indirect: 12 files
- Total potential impact: 17 files
```

### Upstream Dependencies (What This Code Relies On)

```markdown
## Upstream Dependencies

### Direct Dependencies
What this module imports:
- `@webalive/shared` - types, constants
- `./utils` - helper functions
- `zod` - validation

### Transitive Dependencies
What those modules depend on:
- `@webalive/shared` → `@webalive/database`
- `./utils` → `lodash`
```

### Cross-Package Boundaries

```markdown
## Package Boundaries Crossed

| From Package | To Package | Dependency Type |
|--------------|------------|-----------------|
| `apps/web` | `packages/shared` | Types + functions |
| `packages/tools` | `packages/shared` | Constants |
| `apps/web` | `packages/tools` | Tool definitions |

**Risk:** Changes in `packages/shared` affect both `apps/web` and `packages/tools`
```

---

## Risk Assessment

### Blast Radius Categories

| Radius | File Count | Risk Level | Action |
|--------|------------|------------|--------|
| Tiny | 1-3 files | Low | Proceed with normal care |
| Small | 4-10 files | Medium | Review all dependents |
| Medium | 11-30 files | High | Plan carefully, maybe split |
| Large | 30+ files | Critical | Consider alternative approach |

### Critical Path Identification

Components that many others depend on = **high-risk changes**

```markdown
## Critical Components

| Component | Dependents | Risk |
|-----------|------------|------|
| `packages/shared/types.ts` | 47 files | CRITICAL |
| `lib/security.ts` | 23 files | HIGH |
| `utils/formatters.ts` | 12 files | MEDIUM |
| `components/Button.tsx` | 8 files | MEDIUM |
```

### Breaking Change Detection

Will this change cause:
- [ ] **Compilation errors** - Type changes, removed exports
- [ ] **Runtime errors** - Changed behavior, removed functions
- [ ] **Silent bugs** - Same API, different behavior

### Test Coverage Check

```bash
# Find tests for affected files
for file in $(grep -rl "moduleName" --include="*.ts"); do
  test_file="${file%.ts}.test.ts"
  if [ -f "$test_file" ]; then
    echo "✅ $file has tests"
  else
    echo "❌ $file has NO tests"
  fi
done
```

---

## Scout Workflow

### Before Making Changes

```
1. IDENTIFY the change target
   - What file(s) will you modify?
   - What exports/functions/types will change?

2. MAP dependencies
   - Run grep commands to find all usages
   - Document direct and indirect dependents

3. ASSESS blast radius
   - Count affected files
   - Identify critical paths
   - Check test coverage

4. PLAN the change
   - If radius is large, consider splitting
   - If tests are missing, write them first
   - If breaking change, plan migration

5. EXECUTE with awareness
   - Update all dependents
   - Run tests for affected areas
   - Verify no runtime breakage
```

### Quick Scout (5 minutes)

For small changes, run this quick assessment:

```bash
# 1. How many files import this?
grep -rl "from.*targetModule" --include="*.ts" | wc -l

# 2. What functions are used from it?
grep -rh "import.*from.*targetModule" --include="*.ts" | sort | uniq

# 3. Are there tests?
find . -name "*.test.ts" | xargs grep -l "targetModule"
```

### Deep Scout (30 minutes)

For major changes, do full analysis:

```markdown
## Scout Report: [Module Name]

### Overview
- **Target:** [file/module being changed]
- **Change type:** [breaking/non-breaking/addition]
- **Blast radius:** [tiny/small/medium/large]

### Dependency Map
[Full list of dependents and dependencies]

### Risk Analysis
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| [risk] | [H/M/L] | [H/M/L] | [action] |

### Test Coverage
- [x] Unit tests exist
- [ ] Integration tests exist
- [ ] E2E tests cover this path

### Recommendation
[Proceed / Proceed with caution / Split into smaller changes / Reconsider approach]
```

---

## Output Format

### Quick Report

```markdown
## Scout: `utils/formatters.ts`

**Blast Radius:** Medium (15 files)
**Test Coverage:** Partial (60%)
**Risk Level:** Medium

### Affected Files
- Direct: 8 files
- Indirect: 7 files

### Key Concerns
1. `api/users/route.ts` - no tests, uses `formatDate`
2. `components/UserCard.tsx` - uses deprecated `formatName`

### Recommendation
Proceed with caution. Add tests for `api/users/route.ts` first.
```

### Full Report

```markdown
## Scout Report: `packages/shared/types.ts`

### Executive Summary
- **Target:** Core type definitions
- **Change:** Adding required field to `User` type
- **Blast Radius:** CRITICAL (47 files)
- **Recommendation:** Use optional field with migration path

### Dependency Analysis

#### Direct Dependents (12 files)
| File | Usage | Risk |
|------|-------|------|
| `api/users/route.ts` | `User` type in handler | Breaking |
| `components/UserProfile.tsx` | `User` props | Breaking |
| ... | ... | ... |

#### Indirect Dependents (35 files)
[List continues...]

### Breaking Changes
1. All files using `User` type need update
2. Database queries returning `User` need migration
3. API responses need versioning

### Test Coverage
- Unit tests: 60% of affected files
- Integration tests: 40% of affected flows
- E2E tests: Critical paths covered

### Migration Plan
1. Add field as optional with default
2. Update all consumers
3. Run data migration
4. Make field required
5. Remove default

### Timeline Estimate
- Phase 1 (optional field): 1 hour
- Phase 2 (update consumers): 4 hours
- Phase 3 (migration): 2 hours
- Phase 4 (make required): 30 minutes
```

---

## Common Scenarios

### Changing a Shared Type

**High risk.** Types propagate everywhere.

```bash
# Find all usages
grep -r "TypeName" --include="*.ts" --include="*.tsx"

# Count impact
grep -rl "TypeName" --include="*.ts" | wc -l
```

**Strategy:** Add optional field first, migrate, then make required.

### Renaming a Function

**Medium risk.** Find-and-replace, but verify all usages.

```bash
# Find all calls
grep -r "oldFunctionName(" --include="*.ts"

# Find all imports
grep -r "import.*oldFunctionName" --include="*.ts"
```

**Strategy:** Keep old name as alias during transition.

### Removing an Export

**High risk.** Something probably depends on it.

```bash
# Find all imports of this export
grep -r "import.*{ exportName" --include="*.ts"
grep -r "import.*exportName" --include="*.ts"
```

**Strategy:** Deprecate first, remove after verification.

### Changing Package Dependencies

**Variable risk.** Check what re-exports from changed package.

```bash
# Find re-exports
grep -r "export.*from.*packageName" --include="*.ts"

# Find direct imports
grep -r "from.*packageName" --include="*.ts"
```

**Strategy:** Scout both direct and re-exported usages.

---

## Quick Reference

### Essential Commands

```bash
# Count files importing module
grep -rl "from.*module" --include="*.ts" | wc -l

# List all imports from module
grep -rh "import.*from.*module" --include="*.ts" | sort | uniq

# Find function usage
grep -rn "functionName(" --include="*.ts"

# Find type usage
grep -rn ": TypeName" --include="*.ts"

# Find test files for affected code
find . -name "*.test.ts" | xargs grep -l "module"
```

### Risk Decision Matrix

| Blast Radius | Test Coverage | Decision |
|--------------|---------------|----------|
| Small | High | Proceed |
| Small | Low | Add tests, then proceed |
| Large | High | Proceed with caution |
| Large | Low | Split change or add tests first |

### The Scout's Rule

**Never change code without knowing:**
1. What depends on it
2. What it depends on
3. Whether tests will catch breaks
