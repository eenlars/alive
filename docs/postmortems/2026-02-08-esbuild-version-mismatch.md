# Postmortem: 2026-02-08 esbuild Version Mismatch Breaks Static Checks

## Summary
`make static-check` and `make ship` failed with esbuild version mismatch: `Expected "0.25.12" but got "0.27.3"`. The root cause was bun hoisting a single `@esbuild/linux-x64@0.27.3` platform binary to root `node_modules`, while nested dependencies (vitest/vite, drizzle-kit) required `esbuild@^0.25.0` (capped at `<0.26.0`). The nested esbuild packages found the wrong binary and crashed during postinstall validation.

## Impact
- `make ship` failed at the static-check phase — no deployments possible
- `bun install` itself failed (postinstall crash), blocking all dependency operations
- `rm -rf node_modules && bun install` did NOT fix it — the issue was structural

## Symptoms Observed

### 1. Static Check Failure
```
$ make static-check
✘ [ERROR] Cannot start service: Host version "0.25.12" does not match binary version "0.27.3"
failed to load config from /root/webalive/claude-bridge/packages/tools/vitest.config.ts
Error: The service was stopped
```

### 2. bun install Crash
Even after `rm -rf node_modules`, fresh installs failed:
```
$ bun install
Error: Expected "0.25.12" but got "0.27.3"
    at validateBinaryVersion (node_modules/drizzle-kit/node_modules/esbuild/install.js:136:11)
error: postinstall script from "esbuild" exited with 1
```

## Root Cause

### The esbuild Version Conflict

Three different consumers needed different esbuild versions:

| Consumer | Constraint | Resolved To |
|----------|-----------|-------------|
| Root (transitive) | latest | `0.27.3` |
| `drizzle-kit` | `^0.25.4` | `0.25.12` (nested) |
| `vitest/vite` | `^0.25.0` | `0.25.12` (nested) |

The `^0.25.0` semver range means `>=0.25.0 <0.26.0`, so `0.27.3` does **not** satisfy it. Bun correctly created nested `esbuild@0.25.12` package copies for drizzle-kit and vitest/vite.

### The Binary Hoisting Bug

esbuild uses platform-specific optional dependencies (e.g., `@esbuild/linux-x64`) that contain the native binary. Bun hoisted `@esbuild/linux-x64@0.27.3` to the root `node_modules/@esbuild/linux-x64/`, but did **not** install `@esbuild/linux-x64@0.25.12` at the nested level.

When the nested `esbuild@0.25.12` packages ran their postinstall script, they:
1. Looked for the `@esbuild/linux-x64` binary
2. Found the root's `0.27.3` binary (no nested copy existed)
3. Compared `0.27.3` against their expected `0.25.12`
4. Crashed: `Expected "0.25.12" but got "0.27.3"`

### Why `make static-check` Was Extra Vulnerable

`make static-check` ran without `bun install` first. The `make ship` pipeline (`build-and-serve.sh`) already runs `bun install` before static checks, but running `make static-check` directly skipped dependency sync entirely — so stale `node_modules` from a previous state could cause mismatches.

## Attempted Mitigations (Did Not Work)

### 1. Remove Nested node_modules and Reinstall
```bash
rm -rf node_modules/vitest/node_modules/vite/node_modules && bun install
```
**Result:** Bun recreated the same structure — nested esbuild@0.25.12 without its own platform binary.

### 2. Full Clean Reinstall
```bash
rm -rf node_modules && bun install
```
**Result:** Same crash. The lockfile dictated the same resolution, and bun's hoisting strategy didn't change.

## Resolution

### Fix 1: esbuild Override (Root Cause Fix)
Added `"esbuild": "0.27.3"` to `overrides` in `package.json`:
```json
{
  "overrides": {
    "esbuild": "0.27.3"
  }
}
```

This forces all consumers to use the single root esbuild@0.27.3. No nested copies are created, so no binary mismatch can occur. This is safe because:
- esbuild is a build tool with strong backwards compatibility
- All consumers use `^0.25.x` which is a build-time dependency, not runtime
- esbuild 0.27.x is a superset of 0.25.x functionality

### Fix 2: `bun install` in `make static-check` (Prevention)
Added `bun install --frozen-lockfile` to the `static-check` Makefile target:
```makefile
static-check:
	@bun install --frozen-lockfile
	@NODE_OPTIONS="--max-old-space-size=4096" bun run static-check
```

This ensures deps are always in sync when running checks standalone, not just through `make ship`.

## Lessons Learned
1. **Override conflicting native binary packages** - When multiple versions of a package with platform-specific binaries coexist, bun's hoisting can cause binary/package version mismatches. Use `overrides` to force a single version.
2. **Always install deps before checks** - Any target that depends on `node_modules` should ensure deps are installed first. Don't assume they're in sync.
3. **`rm -rf node_modules` doesn't fix structural issues** - If the lockfile dictates a broken resolution, reinstalling reproduces the same problem. The fix must be in `package.json` or the lockfile itself.
4. **esbuild's postinstall validation is strict** - Unlike most packages, esbuild validates its binary version at install time and fails hard on mismatch. This is actually good — it surfaces the problem immediately rather than at runtime.

## What Went Well
- The error message was clear and pointed directly to the version mismatch
- The override fix was clean and didn't require changing any consumer code
- Static checks pass fully after the fix (93 test files, 1474 tests)

## What Went Wrong
- `make static-check` had no `bun install` step, unlike `make ship`
- No override existed for esbuild despite multiple conflicting versions in the dependency tree
- The initial instinct to "just reinstall" wasted time since the issue was structural

## Follow-ups
- [x] Add esbuild override to `package.json`
- [x] Add `bun install --frozen-lockfile` to `make static-check`
- [ ] Audit other Makefile targets for missing `bun install` steps

## Environment
- Linux 6.8.0-78-generic (x86_64)
- Bun 1.3.8
- esbuild 0.27.3 (root) vs 0.25.12 (nested, via drizzle-kit and vitest/vite)
- vitest 4.0.17 (overridden), vite 6.4.1 (nested under vitest)
