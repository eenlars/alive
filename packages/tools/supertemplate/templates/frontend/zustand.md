---
name: Zustand State Management
description: Best practices for Zustand in Vite + React with vanilla stores, Providers, performance patterns, and persistence.
category: setup
complexity: 2
files: 4
dependencies:
  - zustand@^5.0.0
estimatedTime: 10-15 minutes
estimatedTokens: 60
tags: [zustand, state, react, vite, typescript]
requires:
  - Vite 5+
  - React 18+
  - Node 18+
previewImage: https://terminal.goalive.nl/_images/t/alive.best/o/dd3feda2810fc19a/v/orig.webp
enabled: true
---

# Zustand State Management - Best Practices for React + Vite

Best practices for using Zustand in Vite + React applications with vanilla stores, Providers, performance patterns, and persistence. Includes both simple direct stores and advanced Provider patterns for maximum flexibility.

## What You'll Learn

* **Vanilla stores with Providers** (most flexible and testable)
* **Direct store usage** (simplest approach)
* **Performance optimization** with atomic selectors
* **Route-based resets** (SPA-friendly)
* **Persistence** with localStorage
* **TypeScript** best practices

## Step-by-Step Implementation

### Step 1: Install Zustand

**For Claude (AI Assistant):**

Use the `install_package` tool:
```
install_package({ packageName: "zustand", version: "5.0.2" })
```

**For manual installation:**
```bash
# If bun
bun add zustand@5.0.2

# If npm
npm install zustand@5.0.2

# If pnpm
pnpm add zustand@5.0.2

# If yarn
yarn add zustand@5.0.2
```

**Success Criteria:**
- [ ] `zustand` appears in package.json dependencies
- [ ] No installation errors
- [ ] Version 5.0.2 or compatible installed

---

### Step 2: Create a Vanilla Store (Provider Pattern)

**Option A: Vanilla Store with Provider (Recommended for Flexibility)**

**`src/stores/counter-store.ts`**

```ts
import { createStore } from 'zustand/vanilla'

export type CounterState = {
  count: number
}

export type CounterActions = {
  decrementCount: () => void
  incrementCount: () => void
}

export type CounterStore = CounterState & CounterActions

export const defaultInitState: CounterState = { count: 0 }

export const createCounterStore = (initState: CounterState = defaultInitState) => {
  return createStore<CounterStore>()((set) => ({
    ...initState,
    decrementCount: () => set((s) => ({ count: s.count - 1 })),
    incrementCount: () => set((s) => ({ count: s.count + 1 })),
  }))
}
```

> Why vanilla? It lets you **pass initial state** into the store (e.g., from URL params, local storage, or backend data), makes **testing easier**, and allows **multiple instances** of the same store if needed.

**Success Criteria:**
- [ ] `src/stores/counter-store.ts` created
- [ ] File exports `CounterState`, `CounterActions`, `CounterStore`, `createCounterStore`
- [ ] No TypeScript errors
- [ ] Store factory function accepts optional initial state

---

### Step 3: Create the Provider Component

**`src/providers/counter-store-provider.tsx`**

```tsx
import { type ReactNode, createContext, useRef, useContext } from 'react'
import { useStore } from 'zustand'
import { type CounterStore, createCounterStore, type CounterState } from '@/stores/counter-store'

export type CounterStoreApi = ReturnType<typeof createCounterStore>

const CounterStoreContext = createContext<CounterStoreApi | undefined>(undefined)

export interface CounterStoreProviderProps {
  children: ReactNode
  /** Optional initial state (e.g., from URL params, localStorage, or backend) */
  initialState?: CounterState
}

export function CounterStoreProvider({ children, initialState }: CounterStoreProviderProps) {
  const storeRef = useRef<CounterStoreApi>()
  if (!storeRef.current) {
    storeRef.current = createCounterStore(initialState)
  }
  return <CounterStoreContext.Provider value={storeRef.current}>{children}</CounterStoreContext.Provider>
}

export function useCounterStore<T>(selector: (store: CounterStore) => T): T {
  const ctx = useContext(CounterStoreContext)
  if (!ctx) throw new Error('useCounterStore must be used within CounterStoreProvider')
  return useStore(ctx, selector)
}
```

> The `useRef` guard ensures we create the store **once per component mount**, even if the Provider re-renders.

**Success Criteria:**
- [ ] `src/providers/counter-store-provider.tsx` created
- [ ] File exports `CounterStoreProvider` component and `useCounterStore` hook
- [ ] No TypeScript errors
- [ ] Provider accepts optional `initialState` prop

---

### Step 4: Use the Provider in Your App

Wrap your app (or a specific route/page) with the Provider. You can optionally pass `initialState`.

**`src/main.tsx`** (or `src/App.tsx`)

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { CounterStoreProvider } from '@/providers/counter-store-provider'
import { HomePage } from '@/components/pages/home-page'
import './index.css'

// Optional: initialize with data from URL, localStorage, etc.
function getInitialCounterState() {
  const params = new URLSearchParams(window.location.search)
  const countParam = params.get('count')
  return countParam ? { count: parseInt(countParam, 10) } : undefined
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <CounterStoreProvider initialState={getInitialCounterState()}>
      <HomePage />
    </CounterStoreProvider>
  </React.StrictMode>
)
```

**`src/components/pages/home-page.tsx`**

```tsx
import { useCounterStore } from '@/providers/counter-store-provider'

export function HomePage() {
  const count = useCounterStore((s) => s.count)
  const incrementCount = useCounterStore((s) => s.incrementCount)
  const decrementCount = useCounterStore((s) => s.decrementCount)
  
  return (
    <div>
      <h1>Count: {count}</h1>
      <button type="button" onClick={incrementCount}>Increment</button>
      <button type="button" onClick={decrementCount}>Decrement</button>
    </div>
  )
}
```

> **Tip:** Use atomic selectors (one value per `useCounterStore` call) for optimal performance. Each component only re-renders when its selected value changes.

**Success Criteria:**
- [ ] App wrapped with `CounterStoreProvider` in `src/main.tsx`
- [ ] Component uses `useCounterStore` hook to access state
- [ ] Increment/decrement buttons work
- [ ] Count updates in real-time
- [ ] No console errors

---

## Advanced Patterns

### SPA Routing & Store Resets (React Router)

If you want the store to **reset on route change**, key the Provider by the current route:

```tsx
import { useLocation } from 'react-router-dom'
import { CounterStoreProvider } from '@/providers/counter-store-provider'

export function RouteScopedProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return (
    <CounterStoreProvider key={location.pathname}>
      {children}
    </CounterStoreProvider>
  )
}
```

Now wrap your routes with `RouteScopedProvider` to reset state when the path changes.

**Alternative:** Scope the Provider to specific routes instead of the whole app:

```tsx
<Routes>
  <Route path="/counter" element={
    <CounterStoreProvider>
      <CounterPage />
    </CounterStoreProvider>
  } />
  <Route path="/other" element={<OtherPage />} />
</Routes>
```

This way, the counter store only exists on `/counter` and is automatically cleaned up when navigating away.

---

### Alternative: Direct Store (Simpler Pattern)

**Option B: Using Zustand without React Context**

For simpler use cases, you can skip the Provider pattern and use `create()` directly:

**`src/stores/counter-store.ts`**

```ts
import { create } from 'zustand'

type CounterState = { count: number }
type CounterActions = { inc: () => void; dec: () => void }
type CounterStore = CounterState & CounterActions

export const useCounterStore = create<CounterStore>((set) => ({
  count: 0,
  inc: () => set((state) => ({ count: state.count + 1 })),
  dec: () => set((state) => ({ count: state.count - 1 })),
}))
```

**Usage in components:**

```tsx
import { useCounterStore } from '@/stores/counter-store'

export function Counter() {
  const count = useCounterStore((state) => state.count)
  const inc = useCounterStore((state) => state.inc)
  const dec = useCounterStore((state) => state.dec)
  
  return (
    <div>
      <h1>{count}</h1>
      <button onClick={inc}>+</button>
      <button onClick={dec}>-</button>
    </div>
  )
}
```

**When to use this pattern:**
- ✅ Simple global state that doesn't need initial values
- ✅ State that's shared across your entire app
- ✅ No need for multiple instances of the store

**When to use Provider pattern (§1-3):**
- ✅ Need to pass initial state (from URL, backend, etc.)
- ✅ Want to scope state to specific routes
- ✅ Need multiple instances of the same store
- ✅ Easier testing (can inject mock stores)

---

### Persisting State with localStorage

Use the `persist` middleware to automatically save/restore state:

```ts
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

type CounterStore = {
  count: number
  inc: () => void
  dec: () => void
}

export const usePersistedStore = create<CounterStore>()(
  persist(
    (set) => ({
      count: 0,
      inc: () => set((state) => ({ count: state.count + 1 })),
      dec: () => set((state) => ({ count: state.count - 1 })),
    }),
    {
      name: 'counter-storage', // unique name for localStorage key
      storage: createJSONStorage(() => localStorage), // or sessionStorage
      // Optional: only persist specific fields
      partialize: (state) => ({ count: state.count }),
      // Optional: version and migration
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // migrate old data
          persistedState.count = persistedState.count || 0
        }
        return persistedState
      },
    }
  )
)
```

**Features:**
- Automatically saves to localStorage on every state change
- Loads from localStorage on app mount
- `partialize`: Only persist certain fields (keep sensitive data out)
- `version` + `migrate`: Handle breaking changes to your state shape

---

## Common Pitfalls & Best Practices

1. **Subscribing to the whole store** → unnecessary re-renders. Use atomic selectors: `useStore(s => s.count)` not `useStore(s => s)`.
2. **Returning objects/arrays from selectors without `useShallow`** → new reference every time = re-renders even if values unchanged.
3. **Actions in state** → they re-create on every render if not in a stable object. Use the `actions` pattern (see "Keep Actions Separate" below).
4. **Route resets assumed but Provider mounted above the routing boundary** → state doesn't reset. Scope Provider to the page or key by route.
5. **Too many stores** → over-fragmentation. Start with small stores but don't go overboard; combine related state.

---

## Recommended File Structure

```
src/
  main.tsx                     // app entry point
  App.tsx                      // root component
  components/
    Counter.tsx
    pages/
      HomePage.tsx
  providers/
    counter-store-provider.tsx // if using Provider pattern
  stores/
    counter-store.ts           // vanilla store factory (for Provider)
    ui-store.ts                // or direct create() store
    user-store.ts
```

---

## FAQ

**Q: Provider pattern vs. direct `create()`—which should I use?**
Use **Provider** when you need initial state, route scoping, or multiple instances. Use **direct `create()`** for simple global state.

**Q: How do I pass backend data into a store?**
With **Provider**: Pass `initialState` prop. With **direct `create()`**: Call `useStore.setState()` in a `useEffect` after fetching.

**Q: Can I reset the store on navigation?**
Yes. With **Provider**: key it by route (`key={location.pathname}`). With **direct store**: manually call a reset action or use `setState`.

**Q: How do I test components that use Zustand?**
With **Provider**: Pass a mock store. With **direct store**: mock the module or use Zustand's `setState` to set up test data.

**Q: Should I use one big store or many small stores?**
Prefer **many small stores** scoped by domain (user, UI, cart, etc.). Easier to reason about and better performance.

---

## Quick Start Summary

**Provider pattern** (recommended for flexibility):
* `src/stores/counter-store.ts` — vanilla store (see Step 2)
* `src/providers/counter-store-provider.tsx` — Provider (see Step 3)
* `src/components/pages/home-page.tsx` — UI component (see Step 4)
* `src/main.tsx` — wrap with Provider (see Step 4)

**Direct pattern** (simpler for basic needs):
* `src/stores/counter-store.ts` — direct create() (see "Alternative: Direct Store")
* Import and use `useCounterStore` anywhere in your app

You're good to go!

---

## Performance Optimization Patterns

Here are patterns that optimize performance in React apps with Zustand v5:

### Export Custom Hooks Instead of the Store

Expose small, focused hooks so consumers don't accidentally subscribe to the whole store.

```ts
// store
import { create } from 'zustand'

type BearState = { bears: number; fish: number }
type BearActions = {
  increasePopulation: (by: number) => void
  eatFish: () => void
  removeAllBears: () => void
}

type BearStore = BearState & { actions: BearActions }

const useBearStore = create<BearStore>((set) => ({
  bears: 0,
  fish: 0,
  actions: {
    increasePopulation: (by) => set((s) => ({ bears: s.bears + by })),
    eatFish: () => set((s) => ({ fish: s.fish - 1 })),
    removeAllBears: () => set({ bears: 0 }),
  },
}))

// exported hooks (atomic selectors)
export const useBears = () => useBearStore((s) => s.bears)
export const useFish = () => useBearStore((s) => s.fish)
export const useBearActions = () => useBearStore((s) => s.actions)
```

This prevents wide subscriptions and keeps render surfaces minimal.

### Prefer Atomic Selectors

```ts
import { shallow } from 'zustand/shallow'

// tuple selection with shallow compare
export const useBearsAndFish = () =>
  useBearStore((s) => [s.bears, s.fish] as const, shallow)
```

Atomic single-value hooks are still simpler and often faster, but shallow is safe for stable tuple/object selections.

### Keep Actions Separate

Place actions under a stable `actions` object. Name actions by domain intent, e.g. `increasePopulation`, not `setBears`.

```ts
export const useBearActions = () => useBearStore((s) => s.actions)
// usage
const { increasePopulation } = useBearActions()
```

Because the actions object reference is stable, subscribing to it won't trigger re-renders.

### Favor Many Small Stores

Keep scopes tight; compose in components or custom hooks as needed:

```ts
const currentUserId = useCredentialsStore((s) => s.currentUserId)
const user = useUsersStore((s) => s.users[currentUserId])
```

Slices are possible in Zustand, but with TS they add complexity. Start with multiple stores; introduce slices only when you truly need cross-store composition in one instance.

### Combine with Other Hooks

```ts
import { useQuery } from '@tanstack/react-query'

const useFilterStore = create<{ applied: string[]; actions: { add: (f: string) => void } }>((set) => ({
  applied: [],
  actions: { add: (f) => set((s) => ({ applied: [...s.applied, f] })) },
}))

export const useAppliedFilters = () => useFilterStore((s) => s.applied)
export const useFilterActions = () => useFilterStore((s) => s.actions)

export function useFilteredTodos() {
  const filters = useAppliedFilters()
  return useQuery({ queryKey: ['todos', filters], queryFn: () => getTodos(filters) })
}
```

This shows how Zustand composes nicely with React Query and other hooks.

### Import Reference

**Zustand v5 imports:**
* `create` from `'zustand'` — direct store creation
* `createStore` from `'zustand/vanilla'` — for Provider pattern
* `useShallow` from `'zustand/react/shallow'` — hook version of shallow equality
* `persist` + `createJSONStorage` from `'zustand/middleware'` — localStorage persistence

---

## useShallow Quick Reference

When exporting atomic selectors that return objects or arrays, wrap them with `useShallow` to prevent unnecessary re-renders:

```typescript
import { useShallow } from 'zustand/react/shallow'

// ❌ Without useShallow (new object reference every time = re-renders)
export const useDeployForm = () =>
  useDeployStore(state => ({
    domain: state.domain,
    password: state.password,
    setDomain: state.setDomain,
  }))

// ✅ With useShallow (shallow equality check = no re-renders if values unchanged)
export const useDeployForm = () =>
  useDeployStore(
    useShallow(state => ({
      domain: state.domain,
      password: state.password,
      setDomain: state.setDomain,
    }))
  )
```

**When to use `useShallow`:**
- Object destructuring: `{ x, y, z }`
- Array selections: `[a, b, c]`
- Computed objects from state

**When NOT needed:**
- Single primitive values: `state.count`
- Stable object references: `state.actions`

---

## Common Troubleshooting

### Error: "useCounterStore must be used within CounterStoreProvider"

**Cause**: Component using the hook is not wrapped with the Provider

**Solution**: Ensure the Provider wraps your component tree:
```tsx
// ❌ Wrong - Provider missing
<HomePage />

// ✅ Correct - Provider wraps component
<CounterStoreProvider>
  <HomePage />
</CounterStoreProvider>
```

### Components re-rendering too often

**Cause**: Selecting the entire store or using object/array selectors without `useShallow`

**Solution**: Use atomic selectors or `useShallow`:
```tsx
// ❌ Triggers re-render on ANY store change
const store = useCounterStore(state => state)

// ✅ Only re-renders when count changes
const count = useCounterStore(state => state.count)

// ✅ For objects, use useShallow
const form = useCounterStore(
  useShallow(state => ({ count: state.count, inc: state.inc }))
)
```

### Error: "Cannot find module 'zustand'"

**Solution**: Install zustand:
```bash
bun add zustand@5.0.2
```

### Store state persists between page navigations (unwanted)

**Cause**: Provider mounted above routing boundary

**Solution**: Either key the Provider by route or scope it to specific routes:
```tsx
// Option 1: Key by route path
const location = useLocation()
<CounterStoreProvider key={location.pathname}>
  {children}
</CounterStoreProvider>

// Option 2: Scope to specific route
<Routes>
  <Route path="/counter" element={
    <CounterStoreProvider>
      <CounterPage />
    </CounterStoreProvider>
  } />
</Routes>
```

### TypeScript errors with store types

**Cause**: Incorrect selector return type inference

**Solution**: Explicitly type the selector:
```tsx
// ❌ Type inference may fail
const count = useCounterStore(state => state.count)

// ✅ Explicit typing
const count = useCounterStore<number>(state => state.count)

// Or use typed hook
export const useCount = () => useCounterStore(s => s.count)
```

### localStorage persist not working

**Checklist**:
1. Is `persist` middleware imported? ✓
2. Is `name` property unique? ✓
3. Is localStorage available in environment? (SSR check) ✓
4. Check browser DevTools → Application → Local Storage

**Solution for SSR (Next.js)**:
```tsx
import { createJSONStorage } from 'zustand/middleware'

persist(
  (set) => ({ /* ... */ }),
  {
    name: 'counter-storage',
    storage: createJSONStorage(() =>
      typeof window !== 'undefined' ? localStorage : undefined
    ),
  }
)
```

### Actions causing infinite re-renders

**Cause**: Actions recreated on every render if not in stable object

**Solution**: Group actions in a stable `actions` object:
```tsx
// ❌ Actions recreated every time
const useStore = create((set) => ({
  count: 0,
  increment: () => set(s => ({ count: s.count + 1 })),
}))

// ✅ Actions in stable object
const useStore = create((set) => ({
  count: 0,
  actions: {
    increment: () => set(s => ({ count: s.count + 1 })),
  },
}))
```

---

## Additional Resources

- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [Zustand v5 Migration Guide](https://github.com/pmndrs/zustand/releases)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
