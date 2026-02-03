---
name: Zustand + Next.js State Management
description: Best practices for using Zustand with Next.js App Router, Pages Router, SSR, RSC boundaries, and hydration patterns.
---

# Zustand + Next.js (2025 Update): SSR, RSC & Contextless Patterns

*Last updated: Nov 6, 2025*

This guide consolidates current best practices for using **Zustand** with **Next.js** (both **App Router** and **Pages Router**), with a focus on:

* **Per-request stores** (no cross-request leakage)
* **SSR + hydration** without mismatches
* **RSC boundaries** (no hooks/Context in Server Components)
* **Client routing resets** (SPA-friendly)
* **Server caching compatibility** (App Router)
* **Using Zustand *without* React Context** safely when appropriate

---

## TL;DR (Checklist)

* **No global stores on the server.** Create stores **per request** (vanilla store + Provider) or **client-only**.
* **Do not read/write the store in RSCs.** Fetch data in RSC, pass it to a **Client Provider** as `initialState`.
* **Hydrate with the same state** on server and client to avoid mismatches.
* **Reset on route change** (if needed) by scoping the Provider to the page or keying it by pathname.
* **App Router caching is fine** if your store lives in client-only modules/components.
* **Contextless pattern is okay** *if and only if* the store is never created/used on the server and SSR markup does not depend on it.

---

## 1) Project settings (TypeScript)

**`tsconfig.json`** (remove all comments):

```json
{
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

## 2) Write a **vanilla store** (per-request friendly)

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

> Why vanilla? It lets you **instantiate a fresh store per request** on the server and **re-instantiate** the same state on the client for hydration.

---

## 3) Provider (Client Component) with `initialState`

**`src/providers/counter-store-provider.tsx`**

```tsx
'use client'

import { type ReactNode, createContext, useRef, useContext } from 'react'
import { useStore } from 'zustand'
import { type CounterStore, createCounterStore, type CounterState } from '@/stores/counter-store'

export type CounterStoreApi = ReturnType<typeof createCounterStore>

const CounterStoreContext = createContext<CounterStoreApi | undefined>(undefined)

export interface CounterStoreProviderProps {
  children: ReactNode
  /** Must match the state used on the server for SSR to avoid hydration mismatches */
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

> The `useRef` guard ensures we create the store **once per client mount**, even if the Provider re-renders.

---

## 4) Initialize on the **server**, re-create on the **client** (SSR-safe)

You can derive request-specific state (auth, headers, cookies, locale, etc.) in an **RSC** and pass it into the **client** Provider as `initialState`.

### App Router

**`src/app/page.tsx`** (Server Component)

```tsx
import { CounterStoreProvider } from '@/providers/counter-store-provider'
import { HomePage } from '@/components/pages/home-page'

function initCounterState() {
  // Example: request-aware default; must be deterministic between server & client hydration
  return { count: new Date().getFullYear() }
}

export default async function Home() {
  const initialState = initCounterState()
  return (
    <CounterStoreProvider initialState={initialState}>
      <HomePage />
    </CounterStoreProvider>
  )
}
```

**`src/components/pages/home-page.tsx`** (Client Component)

```tsx
'use client'

import { useCounterStore } from '@/providers/counter-store-provider'

export function HomePage() {
  const { count, incrementCount, decrementCount } = useCounterStore((s) => s)
  return (
    <div>
      Count: {count}
      <hr />
      <button type="button" onClick={incrementCount}>Increment Count</button>
      <button type="button" onClick={decrementCount}>Decrement Count</button>
    </div>
  )
}
```

**`src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Create Next App',
  description: 'Generated by create next app',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

### Pages Router

**`src/pages/index.tsx`**

```tsx
import { CounterStoreProvider } from '@/providers/counter-store-provider'
import { HomePage } from '@/components/pages/home-page'

function initCounterState() {
  return { count: new Date().getFullYear() }
}

export default function Home() {
  return (
    <CounterStoreProvider initialState={initCounterState()}>
      <HomePage />
    </CounterStoreProvider>
  )
}
```

> If you don't need request-based initialization, you can create the store at the app root once (but still client-side) and it will be **server caching friendly**.

---

## 5) SPA routing & resetting

Next.js does client-side navigation. If you want the store to **reset on route change**, scope the Provider at the page level or key it by pathname:

```tsx
'use client'
import { usePathname } from 'next/navigation'
import { CounterStoreProvider } from '@/providers/counter-store-provider'

export function RouteScopedProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <CounterStoreProvider key={pathname}>
      {children}
    </CounterStoreProvider>
  )
}
```

Now wrap your page with `RouteScopedProvider` to reset state when the path changes.

---

## 6) **Using Zustand *without* React Context** (Client-only)

You can skip Context **if and only if** all usage is **client-only** and the store is **never referenced on the server**.

**Pattern A — Client-only module store**

**`src/stores/counter-global.client.ts`**

```ts
'use client'
import { create } from 'zustand'

type CounterState = { count: number }
type Actions = { inc: () => void; dec: () => void }

type Store = CounterState & Actions

export const useCounterStore = create<Store>((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
  dec: () => set((s) => ({ count: s.count - 1 })),
}))
```

Use this hook **only** in Client Components. Do **not** import from RSCs.

> ⚠️ **SSR note:** The server-rendered HTML must not depend on this store. If you render values from the store on the client that differ from the server HTML, you'll get hydration warnings. Prefer placeholders or render those parts only on the client.

**Pattern B — Guard server writes with an SSR-safe wrapper (optional)**

If you want additional safety (e.g. to catch accidental server writes), wrap your config to throw on the server:

**`src/stores/utils/ssrSafe.ts`**

```ts
import type { StateCreator, StoreApi } from 'zustand'

export function ssrSafe<T>(config: StateCreator<T>, isSSR = typeof window === 'undefined'): StateCreator<T> {
  return (set, get, api: StoreApi<T>) => {
    if (!isSSR) return config(set, get, api)
    const ssrSet: typeof set = () => {
      throw new Error('Cannot set state of a Zustand store during SSR')
    }
    ;(api as any).setState = ssrSet
    return config(ssrSet, get, api)
  }
}
```

**Usage:**

```ts
'use client'
import { create } from 'zustand'
import { ssrSafe } from '@/stores/utils/ssrSafe'

type Store = { count: number; inc: () => void }

export const useCounterStore = create<Store>(
  ssrSafe((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }))
)
```

> This doesn't make server reading "safe" for SSR markup—only server **writes** are blocked. Keep SSR markup independent of this store.

**Advanced: one-shot client hydration for contextless stores**

If you need to hydrate a client-only store once with server-provided data (without Context), pass data via props and call `setState` in a tiny client component on mount:

```tsx
'use client'
import { useEffect } from 'react'
import { useCounterStore } from '@/stores/counter-global.client'

export function HydrateCounter({ initialCount }: { initialCount: number }) {
  const set = useCounterStore((s) => (v: number) => (s.count = v)) // not ideal: direct assign
  // Better:
  const setState = useCounterStore.setState
  useEffect(() => {
    setState({ count: initialCount }, true) // replace to avoid merging surprises
  }, [initialCount, setState])
  return null
}
```

Place `<HydrateCounter initialCount={...} />` near the top of your client tree. **Ensure** the server HTML doesn't rely on this value to avoid mismatches.

> Tip: The **Provider pattern** remains the most SSR-friendly and ergonomic approach for hydration.

---

## 7) RSC boundaries: do not use the store in Server Components

* **Server Components (RSCs)** cannot use hooks or Context, and must not be stateful.
* Fetch data in RSCs, compute `initialState`, then **pass it as props** into a **Client Provider**.
* **Never** call `useStore`, `useCounterStore`, or write to a store from an RSC.

---

## 8) Server caching compatibility (App Router)

* Keep the store as **module state on the client only** (inside `"use client"` files) or instantiate **per-request** inside a Provider that is ultimately rendered client-side.
* Avoid creating a store instance in an RSC module scope that could be **cached and shared** across requests.

---

## 9) Persisting state (client-only)

When using `persist`, storage must be client-only:

```ts
'use client'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export const usePersistedStore = create(
  persist(
    (set) => ({ count: 0, inc: () => set((s: any) => ({ count: s.count + 1 })) }),
    {
      name: 'counter',
      storage: createJSONStorage(() => localStorage),
      // optional: versioning, partialize, migrate
    }
  )
)
```

> If you SSR a page that later reads this store, ensure the SSR HTML doesn't depend on persisted values.

---

## 10) Common pitfalls

1. **Global store in a shared module** imported by an RSC → **cross-request leaks**.
2. **Different server vs client initial states** → hydration mismatches. Always re-create the store on the client with the **same** state.
3. **Reading client-only stores during SSR** → undefined values on the server, different DOM on client.
4. **Persist middleware on the server** → crashes (no `localStorage`). Keep persistence **client-only**.
5. **Route resets** assumed but Provider mounted above the routing boundary → state doesn't reset. Scope Provider to the page or key by pathname.

---

## 11) Suggested file structure

```
src/
  app/ (or pages/)
  components/
    pages/
      home-page.tsx
  providers/
    counter-store-provider.tsx
  stores/
    counter-store.ts          // vanilla store factory (SSR-friendly)
    counter-global.client.ts  // optional contextless client-only store
    utils/
      ssrSafe.ts              // optional SSR guard wrapper
```

---

## 12) FAQ

**Q: Why not a global (module) store?**
Because a Next.js server handles many requests simultaneously. A module store created on the server can be **shared across requests/users**.

**Q: Is Context required?**
No—but Context + vanilla store is the **safest** for SSR. You may skip Context with a **client-only** store if your SSR markup doesn't depend on it.

**Q: How do I hydrate from server data?**
Pass `initialState` to a **client Provider**, which creates the vanilla store with the same state. That prevents hydration mismatches.

**Q: Can I reset on navigation?**
Yes. Scope the Provider to the page or use `key={usePathname()}` on a Provider wrapper.

**Q: Is this compatible with App Router caching?**
Yes, as long as stores are created on the client or per-request and **never** in a shared RSC module scope.

---

## 13) Copy/paste starter

**Minimal App Router example**

* `src/stores/counter-store.ts` — vanilla store (see §2)
* `src/providers/counter-store-provider.tsx` — Provider (see §3)
* `src/components/pages/home-page.tsx` — client UI (see §4)
* `src/app/page.tsx` — RSC that passes `initialState` (see §4)

You're good to go.

---

## 14) Zustand v4 notes & performance patterns (updated from 2022 blog)

You're on **Zustand v4**. Here are patterns that still hold up well in 2025, adapted to v4 APIs and Next.js:

### 14.1 Export **custom hooks** instead of the store

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

### 14.2 Prefer **atomic selectors**; if you need tuples/objects, use `shallow`

```ts
import { shallow } from 'zustand/shallow'

// tuple selection with shallow compare
export const useBearsAndFish = () =>
  useBearStore((s) => [s.bears, s.fish] as const, shallow)
```

Atomic single-value hooks are still simpler and often faster, but shallow is safe for stable tuple/object selections.

### 14.3 Keep **actions separate** and model them as **events** (not setters)

Place actions under a stable `actions` object. Name actions by domain intent, e.g. `increasePopulation`, not `setBears`.

```ts
export const useBearActions = () => useBearStore((s) => s.actions)
// usage
const { increasePopulation } = useBearActions()
```

Because the actions object reference is stable, subscribing to it won't trigger re-renders.

### 14.4 Favor **many small stores** over one mega-store

Keep scopes tight; compose in components or custom hooks as needed:

```ts
const currentUserId = useCredentialsStore((s) => s.currentUserId)
const user = useUsersStore((s) => s.users[currentUserId])
```

Slices are possible in Zustand, but with TS they add complexity. Start with multiple stores; introduce slices only when you truly need cross-store composition in one instance.

### 14.5 Combine with other hooks (TanStack Query, URL state)

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

This mirrors the 2022 article's idea but aligns with v4 and modern Query APIs.

### 14.6 Contextless (client-only) usage with v4

It's acceptable to skip Context **only** if the store is strictly **client-only** and never read on the server. Mark files with `"use client"`, and don't render SSR HTML that depends on store values. For one-shot hydration, mount a tiny client component that calls `useStore.setState` in `useEffect`.

```ts
'use client'
import { create } from 'zustand'

type S = { count: number; inc: () => void }
export const useCounterStore = create<S>((set) => ({ count: 0, inc: () => set((s) => ({ count: s.count + 1 })) }))
```

> When SSR matters, prefer the **vanilla-store + Provider** pattern from sections §2–§4.

### 14.7 v4 import notes

* `create` from `'zustand'`
* `createStore` from `'zustand/vanilla'` (for SSR-friendly factories)
* `shallow` from `'zustand/shallow'` (named export in modern examples)
* `persist` + `createJSONStorage` from `'zustand/middleware'` (client-only)

---

## Quick Reference: useShallow for Atomic Selectors

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
