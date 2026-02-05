# Postmortem: 2026-02-05 Vitest 4.x Hanging on Startup

## Summary
Vitest 4.x (specifically 4.0.15) would hang indefinitely during initialization, producing zero output. The root cause was a combination of:
1. **Breaking configuration changes** - Vitest 4 removed `poolOptions` entirely, making our v3 config invalid
2. **New pool architecture** - Vitest 4 rewrote the entire pool system, replacing `tinypool` with a new implementation
3. **New module runner** - Vitest 4 replaced `vite-node` with Vite's native `ModuleRunner`

These changes, combined with native modules (@napi-rs/image) and Bun runtime, caused silent initialization failures.

## Impact
- `bun run test` would hang forever with no output
- Developers unable to run unit tests locally
- CI/CD pipelines would timeout
- Accumulated zombie esbuild processes consuming system resources

## Symptoms Observed

### 1. Zero Output on Startup
```bash
$ bun vitest run
# ... hangs indefinitely, no output at all
```

Even with `--reporter=verbose` or `DEBUG=vitest*`, no output was produced. The process appeared to hang during initialization before any test discovery.

### 2. Zombie esbuild Processes
Multiple esbuild processes stuck in "UE" (Uninterruptible Sleep) state:
```
here  80634  0.0  0.0  410069888  32  ??  UE  11:51PM  0:00.00  .../esbuild --service=0.25.12 --ping
here  79299  0.0  0.0  410069888  32  ??  UE  11:48PM  0:00.00  .../esbuild --service=0.25.12 --ping
```

These processes accumulated with each test run attempt and could not be killed with `pkill -9`.

### 3. Empty Output Files
When redirecting output to files, the files remained at 0 bytes:
```bash
$ node ./node_modules/vitest/vitest.mjs run > /tmp/vitest-out.log 2>&1 &
$ sleep 10 && wc -l /tmp/vitest-out.log
0 /tmp/vitest-out.log
```

## Root Causes

### 1. Invalid Configuration (Primary Cause)
Our vitest config used v3 syntax that **doesn't exist in v4**:
```typescript
// OUR CONFIG (v3 syntax - INVALID in v4)
poolOptions: {
  forks: {
    singleFork: true,
    isolate: false,
  },
},
```

In Vitest 4, `poolOptions` was **completely removed**. The correct v4 syntax is:
```typescript
// CORRECT v4 syntax
pool: "forks",
maxWorkers: 1,
isolate: false,
```

### 2. Major Architectural Changes in Vitest 4
Per the [migration guide](https://vitest.dev/guide/migration):
- **Pool rewrite**: Removed `tinypool`, rewrote pool architecture entirely
- **Module runner change**: Replaced `vite-node` with Vite's native `ModuleRunner`
- **Config restructuring**: `poolOptions` removed, options now top-level

### 3. Native Modules + Bun Incompatibility
From [Vitest common errors](https://vitest.dev/guide/common-errors):
> "Running native NodeJS modules in pool: 'threads' can run into cryptic errors from the native code, as the native module is likely not built to be multi-thread safe."

From [GitHub issue #7402](https://github.com/vitest-dev/vitest/issues/7402):
> "Bun is not compatible with `node:child_process` and `node:worker_threads` that Tinypool uses."

### 4. Known Vitest 4 Issues
- [Memory leak in 4.0.18](https://github.com/vitest-dev/vitest/issues/9560) causing OOM
- [Hanging process on Windows](https://github.com/vitest-dev/vitest/issues/9494) with typecheck enabled
- [Performance regression](https://github.com/vitest-dev/vitest/issues/8808) when migrating from v3 (2x slower)

## Attempted Mitigations (Did Not Work)

### 1. Pool Configuration (Invalid v4 Syntax)
```typescript
pool: "forks",
poolOptions: {  // <-- DOESN'T EXIST IN V4
  forks: {
    singleFork: true,
    isolate: false,
  },
},
```
**Result:** Config silently ignored, hung anyway.

### 2. Disable optimizeDeps
```typescript
optimizeDeps: {
  disabled: true,
},
```
**Result:** Still hung.

### 3. Aggressive Timeouts
```typescript
teardownTimeout: 3000,
hookTimeout: 5000,
testTimeout: 10000,
fileParallelism: false,
```
**Result:** Still hung (timeouts don't help if initialization never completes).

## Resolution
Downgraded from vitest 4.0.15 to vitest 3.2.4:
```bash
bun add -D vitest@3
```

**Result:** Tests run successfully in ~7 seconds (81 test files, 1330 tests).

## Why Downgrade Instead of Fix Config?
1. Vitest 4's new architecture may have fundamental issues with Bun + native modules
2. The silent failure (no error, no output) makes debugging extremely difficult
3. Vitest 3 is stable and actively maintained
4. Would require significant config rewrite and testing to migrate properly

## Configuration After Fix
```typescript
// vitest.config.ts
export const baseTestConfig = {
  globals: true,
  setupFiles: ["./tests/setup.ts"],
  pool: "forks" as const,  // Use forks for native module safety
  testTimeout: 10000,
  hookTimeout: 10000,
}
```

## Bun Test Runner Evaluation
Considered migrating to `bun:test` but rejected due to:
- **No test isolation** - Side effects leak between test suites
- **Must import test functions** - No global `test`/`describe`
- **Less mature mocking** - No `__mocks__` directory support

For a codebase with 1300+ tests and complex mocking, test isolation is critical.

## Follow-ups
- [x] Pin vitest to `"3"` in package.json to prevent accidental upgrade
- [ ] Monitor vitest 4.x for Bun + native module compatibility fixes
- [ ] If upgrading to v4, follow [migration guide](https://vitest.dev/guide/migration) carefully
- [ ] Test v4 migration in isolated branch before production use

## Lessons Learned
1. **Read migration guides** - Vitest 4 had major breaking changes
2. **Silent failures are the worst** - No error message = hard to debug
3. **Don't assume config is valid** - Invalid options were silently ignored
4. **Version pin major versions** - `"3"` not `"^4"` for test frameworks

## What Went Well
- Downgrade to vitest 3.x was straightforward
- All 1330 tests pass without modification
- No code changes required beyond config

## What Went Wrong
- No clear error message - just silent hanging
- Invalid config options silently ignored
- Hours spent debugging before checking version

## Where We Got Lucky
- vitest 3.x is still maintained and compatible
- No test code needed modification
- The issue was reproducible (not intermittent)

## References
- [Vitest 4.0 Migration Guide](https://vitest.dev/guide/migration)
- [Vitest 4.0 Release Blog](https://vitest.dev/blog/vitest-4)
- [Vitest Common Errors](https://vitest.dev/guide/common-errors)
- [GitHub: Memory leak in 4.0.18](https://github.com/vitest-dev/vitest/issues/9560)
- [GitHub: Bun + Vitest incompatibility](https://github.com/vitest-dev/vitest/issues/7402)
- [GitHub: v3→v4 Performance regression](https://github.com/vitest-dev/vitest/issues/8808)

## Environment
- macOS Darwin 24.6.0
- Bun 1.2.22
- vitest 4.0.15 (broken) → vitest 3.2.4 (working)
- Node dependencies: @napi-rs/image ^1.12.0
