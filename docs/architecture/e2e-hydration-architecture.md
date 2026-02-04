# E2E Test Hydration Architecture

This document describes the coordinated hydration system for E2E tests, designed to eliminate race conditions and flaky tests.

## Problem Statement

E2E tests were slow, flaky, and hard to extend due to:
1. **Non-deterministic client readiness**: React + Zustand persist hydration timing varies
2. **Partial hydration coordination**: Only 4 of 12 persisted stores were coordinated
3. **Parallel worker contention**: Multiple workers hitting a shared Next.js server
4. **Implicit test state**: Tests relied on auto-hydration timing and default state

## Solution Architecture

### Phase 1: Coordinated Hydration

All persisted Zustand stores now use `skipHydration: true` and register themselves via a central registry:

```typescript
// store-registrations.ts - centralized registration with priorities
registerStore({
  name: "workspace",
  rehydrate: () => useWorkspaceStoreBase.persist.rehydrate(),
  hasHydrated: () => useWorkspaceStoreBase.persist.hasHydrated(),
  priority: 10, // Higher priority stores hydrate first
})

// HydrationBoundary.tsx imports store-registrations to trigger registration
import "./store-registrations"

// Then calls hydrateAll() from hydration-registry
hydrateAll().then(() => setAppHydrated(true))
```

**Store Registration System:**
- Stores register via `registerStore()` in `store-registrations.ts`
- No hardcoded lists - registration happens at module load time
- Priority levels control hydration order (lower = first)
- Easy to add new stores without modifying HydrationBoundary

**Priority Levels:**
- 10-19: Core stores (workspace, session) - must hydrate first
- 20-49: Data stores (messages, tabs, llm)
- 50-99: UI preference stores (debug, feature flags, goal)
- 100+: Low priority (deploy, onboarding)

**Key synchronization primitives:**
- `window.__E2E__.appReady`: Promise that resolves when ALL stores are hydrated
- `window.__E2E__.chatReady`: Promise for chat-specific invariants
- `window.__E2E_APP_READY__`: Boolean flag (for simpler waitForFunction checks)
- `window.__APP_HYDRATED__`: Legacy flag (kept for backwards compatibility)
- `document.documentElement.dataset.e2eReady`: DOM attribute for fast assertions

### Phase 2: Explicit Test State

Tests now inject explicit localStorage state for all stores via `createTestStorageState()`:

```typescript
const storageEntries = createTestStorageState({
  workspace: "e2e-w0.bridge.local",
  orgId: "org-123",
  featureFlags: {},
  debug: { isDebugView: false, showSSETerminal: false, showSandbox: false },
})
```

This eliminates:
- Dependency on auto-hydration timing
- Flash of wrong UI state
- Implicit state assumptions in tests

### Phase 3: Per-Worker Port Isolation (Optional)

For maximum isolation, use `playwright.multi-port.config.ts`:

```
Worker 0 → http://localhost:9100
Worker 1 → http://localhost:9101
Worker 2 → http://localhost:9102
Worker 3 → http://localhost:9103
```

This eliminates shared-server contention at the cost of higher resource usage.

## E2E Instrumentation

When `PLAYWRIGHT_TEST=true`, the app exposes timing metrics:

```typescript
interface E2EMetrics {
  marks: {
    hydrationStart?: number
    hydrationEnd?: number
    appReady?: number
  }
  stores: Record<string, {
    hydrationStart?: number
    hydrationEnd?: number
    durationMs?: number
  }>
  totalDurationMs?: number
}
```

Access via `window.__E2E__` for debugging flaky tests.

## File Reference

| File | Purpose |
|------|---------|
| `lib/stores/hydration-registry.ts` | Central registry with promise-based readiness |
| `lib/stores/store-registrations.ts` | All store registrations with priorities |
| `lib/stores/HydrationBoundary.tsx` | React component that triggers hydration |
| `e2e-tests/fixtures.ts` | Playwright fixtures with state injection |
| `e2e-tests/helpers/assertions.ts` | `waitForAppReady()` and helpers |
| `packages/shared/src/constants.ts` | `createTestStorageState()` builder |
| `playwright.multi-port.config.ts` | Per-worker port isolation config |
| `scripts/start-multi-port-servers.sh` | Multi-server launcher script |

## Store Storage Keys

All persisted stores use these localStorage keys (defined in `@webalive/shared`):

```typescript
export const STORE_STORAGE_KEYS = {
  WORKSPACE: "workspace-storage",
  MESSAGE: "claude-messages-v4",
  TAB: "claude-tabs-v1",
  LLM: "alive-llm-settings-v2",
  DEBUG: "alive-debug-view-v6",
  FEATURE_FLAG: "feature-flag-overrides-v1",
  SESSION: "claude-session-storage",
  GOAL: "goal-storage",
  ONBOARDING: "onboarding-storage",
  DEPLOY: "deploy-storage",
  USER: "user-store",
  USER_PROMPTS: "user-prompts-store",
}
```

## Migration Guide

### Adding a New Persisted Store

1. Create store with `skipHydration: true`:
   ```typescript
   export const useMyStoreBase = create<MyStore>()(
     persist(/* ... */, {
       name: "my-store-key",
       skipHydration: true,
     })
   )
   ```

2. Register in `store-registrations.ts` with appropriate priority:
   ```typescript
   import { useMyStoreBase } from "./myStore"

   registerStore({
     name: "myStore",
     rehydrate: wrapRehydrate(() => useMyStoreBase.persist.rehydrate()),
     hasHydrated: () => useMyStoreBase.persist.hasHydrated(),
     priority: 50, // UI preference level
   })
   ```

3. Add key to `STORE_STORAGE_KEYS` in `packages/shared/src/constants.ts`

4. Update `createTestStorageState()` if needed for E2E tests

### Testing Hydration Changes

```bash
# Run unit tests
bun run unit

# Run E2E with standard config (recommended)
bun run test:e2e

# Run E2E with per-worker isolation (for debugging contention issues)
npx playwright test --config=playwright.multi-port.config.ts
```

## Expected Outcomes

- **Flake rate**: Significantly reduced due to deterministic hydration
- **Runtime variance**: p95/p99 improved with per-port isolation
- **Developer experience**: New tests don't require timing knowledge
- **Product quality**: Reduced "flash of wrong state" for real users
