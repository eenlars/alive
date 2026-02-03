# Parallel Tab Isolation: Path to Stability

**Status: ✅ IMPLEMENTED** (January 2025)

**Problem**: Multiple browser tabs for the same workspace share `activeTabByWorkspace` via `localStorage`, which makes both tabs send the same `tabId`. The server lock (`tabKey`) then returns `409 CONVERSATION_BUSY` for the second tab. This blocks parallel work.

**Goal**: Allow multiple browser tabs to work in the same workspace concurrently without sharing the same active `tabId`, while preserving tab history and minimizing migration risk.

---

## Implementation Summary

The solution implements **Option B** by splitting the old `tabStore` into two stores:

| Store | Storage | Purpose |
|-------|---------|---------|
| `tabDataStore` | localStorage | Shared tab history (tabsByWorkspace) |
| `tabViewStore` | sessionStorage | Per-browser-tab UI state (activeTabByWorkspace, tabsExpandedByWorkspace) |

**Key files:**
- `apps/web/lib/tabs/tabModel.ts` - Pure helper functions and types
- `apps/web/lib/stores/tabDataStore.ts` - Shared data (localStorage)
- `apps/web/lib/stores/tabViewStore.ts` - Per-tab UI state (sessionStorage)
- `apps/web/lib/stores/tabStore.ts` - Facade for backwards compatibility

**Migration:**
- Old data from `claude-tab-storage` (localStorage) is automatically migrated to `claude-tab-data`
- View state starts fresh per browser tab (intentional - avoids stale selections)

---

## Constraints and Invariants

- `Tab.id` **is** the conversation key used by the backend lock (`tabKey`).
- The server lock must remain; it prevents overlapping streams on the same `tabId`.
- `tabsByWorkspace` should remain shared and persistent (restores history after refresh).
- UI-only state (active tab selection, sidebar expansion) should be per-browser-tab.

---

## Options Considered

### Option A: Use `sessionStorage` for the entire `tabStore`
**Pros**
- Simple change, per-tab isolation for all state

**Cons**
- Loses shared tab history across browser tabs
- Users expect the tab list to persist across reloads and be shared
- Not future-proof if more shared state is added

**Verdict**: Too destructive to persistence and cross-tab visibility.

---

### Option B: Split state by persistence layer (recommended)
**Approach**
- **Shared state** in `localStorage`:
  - `tabsByWorkspace`
  - `nextTabNumberByWorkspace` (legacy)
- **Per-tab state** in `sessionStorage`:
  - `activeTabByWorkspace`
  - `tabsExpandedByWorkspace`
- Introduce a per-browser-tab ID (e.g., `browserTabId`) stored in `sessionStorage` for future debugging and UI messaging.

**Pros**
- Solves parallel tab blocking
- Preserves tab history and persistence
- Clear separation of concerns (data vs. view state)
- Scales for future state without accidental cross-tab coupling

**Cons**
- Requires splitting the store or introducing a custom multi-storage adapter
- Needs careful migration logic for old persisted data

**Verdict**: Best balance of stability, correctness, and long-term maintainability.

---

### Option C: Modify server lock to include `browserTabId`
**Pros**
- Would allow two browser tabs to stream with the same `tabId`

**Cons**
- Violates the invariant: `tabId` = conversation key
- Risk of message interleaving and corruption
- Requires sweeping backend changes and new failure modes

**Verdict**: Unsafe and unstable.

---

## Recommended Path (Option B)

### 1) Split the store into **data** vs **view**
**Data store (localStorage)**
- `tabsByWorkspace`
- `nextTabNumberByWorkspace` (if still needed)

**View store (sessionStorage)**
- `activeTabByWorkspace`
- `tabsExpandedByWorkspace`
- Optional: `lastWorkspaceViewed` (if needed for UX)

This isolates **per-browser-tab selection** while keeping **shared history** intact.

---

### 2) Change initialization logic for new browser tabs
Current behavior: If `activeTab` is missing, select the first open tab in the workspace.

**New behavior**:
- If `activeTabByWorkspace` is missing **for this browser tab**, create a **new tab group** instead of adopting an existing open tab.
- This ensures each browser tab gets a unique `tabId` by default.

This prevents accidental tabId collisions even when open tabs already exist.

---

### 3) Migrate safely
Migration should **ignore** old `activeTabByWorkspace` from `localStorage`:
- Keep `tabsByWorkspace` intact
- Reset per-tab view state for the current browser tab only

This avoids pulling a stale, cross-tab active ID into the new per-tab view store.

---

### 4) Add guardrails in UX (optional but stabilizing)
If a user manually selects a tab that is already streaming in another browser tab:
- Show a non-blocking warning (e.g., "This conversation is active in another tab.")
- Offer a button to clone into a new tab group.

This turns accidental lock conflicts into deliberate choices.

---

## Consolidation and DRY Improvements (Do This While Implementing)

These are low-risk refactors that reduce duplication and make the new split-store architecture easier to reason about.

### A) Extract shared tab helpers into a `tabModel` module
**Problem**: `tabStore.ts` contains pure helpers (e.g., `isOpen`, `filterStaleTabs`, `getNextTabNumber`) mixed with store wiring. Some logic is duplicated in tests or other hooks.

**Action**:
- Move pure functions and shared types into `apps/web/lib/tabs/tabModel.ts` (name is flexible).
- Re-export for use in `tabStore`, tests, and any future hooks.

**Benefits**:
- Single source for tab invariants
- Easier unit testing (no Zustand import needed)
- Encourages reuse as we split view/data stores

---

### B) Unify “get active tab” and “ensure active tab” logic
**Problem**: `useActiveSession` includes initialization logic that depends on `workspaceTabs` and `activeTab` but will soon need to reference split stores. This logic is likely to be duplicated if not centralized.

**Action**:
- Extract `ensureActiveTabForWorkspace()` into a shared helper that takes:
  - `workspace`
  - `activeTabId`
  - `openTabs`
  - `setActiveTab()`
  - `createTabGroupWithTab()`
- Use this in `useActiveSession` and any future hydration logic.

**Benefits**:
- Single rule for “when to create a new tab”
- Easy to test in isolation
- Prevents future drift between UI and session behavior

---

### C) Split store composition instead of duplicating selectors
**Problem**: If we add a separate `tabViewStore`, it’s easy to duplicate selectors/actions (e.g., `useActiveTab`, `useTabsExpanded`) in multiple files.

**Action**:
- Create a small façade module `apps/web/lib/stores/tabSelectors.ts` that composes:
  - data store selectors (tab lists)
  - view store selectors (active/expanded)
- Export stable hooks from one place.

**Benefits**:
- Single import point
- Avoids “which store do I use” confusion
- Reduces churn in components

---

### D) Consolidate storage migration logic
**Problem**: `tabStore` has migration logic mixed with storage config. With two stores, migration rules can duplicate or diverge.

**Action**:
- Centralize migrations in a `tabStoreMigrations.ts` module that both stores import.
- Provide explicit version constants for each store.

**Benefits**:
- One place to reason about storage evolution
- Prevents mismatched versions across stores

---

## Code Smells / Bad Signs Observed

These aren’t fatal, but they are signals that stability can degrade if left as-is.

1) **UI state persisted in shared storage**
   - `activeTabByWorkspace` and `tabsExpandedByWorkspace` are UI preferences but persisted globally.
   - This is the root cause of cross-tab collisions.

2) **Initialization logic mixed into a React hook**
   - `useActiveSession` contains tab-creation rules.
   - This is policy (business rule) embedded in view code; easy to replicate inconsistently.

3) **Single store holds both durable data and ephemeral UI state**
   - Makes it easy to introduce new cross-tab coupling in the future.

4) **Implicit assumptions about “one browser tab = one session”**
   - Not enforced anywhere; gets broken as soon as multiple tabs are opened.

5) **Migration logic tied to persistence layer**
   - The existing `migrate()` handles legacy tab IDs but will become more brittle if new stores are added without shared migration helpers.

---

## Implementation (Completed)

The fix has been implemented with the following changes:

### New Files Created

1. **`lib/tabs/tabModel.ts`** - Pure functions and types for tab management
   - Extracted from `tabStore.ts` for reuse across stores
   - Contains: `Tab` type, `isOpen`, `isClosed`, `createTab`, `filterStaleTabs`, etc.

2. **`lib/stores/tabDataStore.ts`** - localStorage store for shared tab history
   - Storage key: `claude-tab-data`
   - Contains: `tabsByWorkspace` (all tab data)
   - Shared across browser tabs

3. **`lib/stores/tabViewStore.ts`** - sessionStorage store for per-browser-tab UI state
   - Storage key: `claude-tab-view`
   - Contains: `activeTabByWorkspace`, `tabsExpandedByWorkspace`
   - **ISOLATED per browser tab** (the key fix)

4. **`lib/stores/tabStore.ts`** - Facade for backwards compatibility
   - Re-exports both stores
   - Provides `useTabActions()` that coordinates both stores
   - Provides `useTabStore.getState()` / `setState()` for tests

### Migration

- Old data from `claude-tab-storage` is automatically migrated to `claude-tab-data`
- Migration runs once at module load via `migrateFromLegacyTabStore()`
- View store starts fresh (intentional - no stale active selections)

### Store Registration

Updated `store-registrations.ts` to register both stores:
- `tabData` (priority 24) - must hydrate first
- `tabView` (priority 25) - depends on data store

### How It Works Now

```
Browser Tab A (sessionStorage A)           Browser Tab B (sessionStorage B)
─────────────────────────────────          ─────────────────────────────────
1. Opens workspace "example.com"           2. Opens workspace "example.com"
2. Creates chat tab "uuid-A"               3. Creates chat tab "uuid-B"
   activeTabByWorkspace = "uuid-A"            activeTabByWorkspace = "uuid-B"
   (stored in sessionStorage A)               (stored in sessionStorage B)

3. Both share tabsByWorkspace              4. Both share tabsByWorkspace
   (stored in localStorage)                   (stored in localStorage)

5. User sends message                      6. User sends message
   POST { tabId: "uuid-A" }                   POST { tabId: "uuid-B" }
   → Lock acquired ✓                          → Lock acquired ✓ (different key!)
```

### Testing Required

- [ ] `tabViewStore` isolation across two simulated browser tabs
- [ ] New browser tab creates its own tab instead of sharing existing
- [ ] Integration test: two browser tabs can send concurrently without 409

---

## Why This Is the Most Stable Path

- Aligns with existing invariant: one `tabId` = one conversation lock.
- Removes accidental cross-tab coupling at the root cause (`localStorage`).
- Keeps persistence of data while isolating view state.
- Makes future multi-tab features safe by default.

---

## Success Criteria

- Two browser tabs in the same workspace can send messages concurrently.
- No 409 `CONVERSATION_BUSY` unless both tabs intentionally select the same tab.
- Refreshing a tab preserves its own active selection.
- Tab history remains intact and shared across tabs.
