# TanStack Query Best Practices & Implementation Guide

## Overview
TanStack Query (formerly React Query) is a powerful data fetching and caching library that eliminates the need for Redux when managing server state. This skill covers industry best practices, configuration patterns, and optimization techniques.

## Core Concepts

### The Three Pillars of Caching

#### 1. **staleTime** - Data Freshness Window
- Controls how long data is considered "fresh"
- Default: `0` (immediately stale)
- During this period, no automatic refetch occurs even on component remount
- **Best Practice**: Set staleTime > 0 for data that doesn't change frequently

```typescript
// Data fresh for 5 minutes - won't refetch during this window
useQuery({
  queryKey: ['user'],
  queryFn: fetchUser,
  staleTime: 5 * 60 * 1000,  // 5 minutes
})
```

#### 2. **gcTime** (Garbage Collection Time, formerly cacheTime)
- How long inactive queries stay in memory before garbage collection
- Default: `5 * 60 * 1000` (5 minutes)
- After this time, if query isn't used, it's removed from cache
- **Best Practice**: gcTime ≥ staleTime

```typescript
useQuery({
  queryKey: ['user'],
  queryFn: fetchUser,
  staleTime: 5 * 60 * 1000,   // Fresh for 5 min
  gcTime: 30 * 60 * 1000,     // Keep in memory for 30 min
})
```

#### 3. **Query Keys** - Cache Identifiers
- Array-based unique identifiers for caching
- Structure: `[namespace, identifier, filters]`
- Critical for proper cache invalidation

```typescript
// Good query key structure
['user']                              // Top level
['user', userId]                      // With identifier
['workspaces', orgId, { sort: 'asc' }] // With filters
['workspaces', orgId, 'members']      // Related data

// Use Query Key Factory pattern
const userKeys = {
  all: ['user'] as const,
  detail: (id: string) => [...userKeys.all, id] as const,
  settings: (id: string) => [...userKeys.detail(id), 'settings'] as const,
}
```

---

## Configuration Patterns

### Global Configuration (Recommended)

```typescript
import { QueryClient } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 minutes
      gcTime: 30 * 60 * 1000,          // 30 minutes
      retry: 1,                          // Retry once on failure
      retryDelay: (attemptIndex) =>
        Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
      refetchOnWindowFocus: false,      // Don't refetch on tab focus
      refetchOnReconnect: 'stale',      // Refetch stale data on reconnect
      refetchOnMount: 'stale',          // Refetch stale on mount
    },
    mutations: {
      retry: 1,
      retryDelay: 500,
    },
  },
})
```

### Per-Query Configuration (Override Global)

```typescript
// Use longer cache for static data
useQuery({
  queryKey: ['config'],
  queryFn: fetchConfig,
  staleTime: 24 * 60 * 60 * 1000, // 24 hours for static config
})

// Use shorter cache for real-time data
useQuery({
  queryKey: ['live-stats'],
  queryFn: fetchStats,
  staleTime: 10 * 1000, // 10 seconds
  refetchInterval: 5 * 1000, // Poll every 5 seconds
})
```

---

## Best Practices

### 1. Avoid Request Waterfalls
**Problem**: Sequential queries that depend on each other create waterfalls

```typescript
// ❌ BAD - Waterfall: fetch user → fetch posts
const { data: user } = useQuery({
  queryKey: ['user'],
  queryFn: fetchUser,
})

const { data: posts } = useQuery({
  queryKey: ['posts', user?.id],
  queryFn: () => fetchPosts(user.id),
  enabled: !!user?.id, // Only runs after user loads
})

// ✅ GOOD - Parallel: fetch both simultaneously
const userQuery = useQuery({
  queryKey: ['user'],
  queryFn: fetchUser,
})

const postsQuery = useQuery({
  queryKey: ['posts', userId],
  queryFn: () => fetchPosts(userId),
  enabled: !!userId, // Load user independently
})
```

### 2. Deduplication (Automatic)
Multiple components requesting same data = one network request

```typescript
// In App.tsx
<UserCard /> // Makes request for ['user']

// In Sidebar.tsx
<UserProfile /> // Same query key - REUSES request!

// Both get same data, only 1 network call
```

### 3. Stale-While-Revalidate Pattern
Serve cached data immediately, refetch in background

```typescript
useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
  staleTime: 5 * 60 * 1000, // Fresh for 5 min
  gcTime: 30 * 60 * 1000,   // Keep for 30 min
})

// Timeline:
// 0-5 min: Show cached data (fresh)
// 5-30 min: Show cached data, refetch in background
// >30 min: Cache cleared
```

### 4. Cache Invalidation - Force Refresh
Invalidate cache when data is known to be stale

```typescript
import { useQueryClient } from '@tanstack/react-query'

const queryClient = useQueryClient()

// After adding/updating data
const mutation = useMutation({
  mutationFn: createUser,
  onSuccess: () => {
    // Invalidate all user queries
    queryClient.invalidateQueries({
      queryKey: ['users']
    })
  },
})

// Invalidate specific user
queryClient.invalidateQueries({
  queryKey: ['users', userId]
})

// Invalidate all queries
queryClient.resetQueries()
```

### 5. Prefetching - Fetch Before Needed
Anticipate user actions and prefetch data

```typescript
const queryClient = useQueryClient()

const prefetchUser = (userId: string) => {
  queryClient.prefetchQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
    staleTime: 5 * 60 * 1000,
  })
}

// Prefetch on hover
<button onMouseEnter={() => prefetchUser(userId)}>
  View Profile
</button>
```

### 6. Error Handling & Retry
Intelligent retry logic with exponential backoff

```typescript
useQuery({
  queryKey: ['data'],
  queryFn: fetchData,
  retry: (failureCount, error) => {
    // Don't retry 404s
    if (error.status === 404) return false
    // Retry max 3 times
    return failureCount < 3
  },
  retryDelay: (attemptIndex) => {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    return Math.min(1000 * 2 ** attemptIndex, 30000)
  },
})
```

### 7. Optimistic Updates
Update UI immediately, rollback if mutation fails

```typescript
const mutation = useMutation({
  mutationFn: updateUser,
  onMutate: async (newData) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['user'] })

    // Get previous data
    const previousData = queryClient.getQueryData(['user'])

    // Update cache optimistically
    queryClient.setQueryData(['user'], newData)

    // Return context for rollback
    return { previousData }
  },
  onError: (err, newData, context) => {
    // Rollback on error
    queryClient.setQueryData(['user'], context.previousData)
  },
})
```

### 8. Query Key Factory Pattern
Prevent key duplication and enable bulk invalidation

```typescript
// Define at module level
export const userKeys = {
  all: ['user'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (filters: QueryFilters) => [...userKeys.lists(), filters] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  edit: (id: string) => [...userKeys.detail(id), 'edit'] as const,
  settings: (id: string) => [...userKeys.detail(id), 'settings'] as const,
}

// Usage
useQuery({
  queryKey: userKeys.detail(userId),
  queryFn: () => fetchUser(userId),
})

// Invalidate all user data
queryClient.invalidateQueries({ queryKey: userKeys.all })

// Invalidate specific user
queryClient.invalidateQueries({ queryKey: userKeys.detail(userId) })

// Invalidate user settings only
queryClient.invalidateQueries({ queryKey: userKeys.settings(userId) })
```

---

## Real-World Patterns

### Settings Page with Multiple Queries

```typescript
// hooks/useSettingsQueries.ts
export function useOrganizationsQuery() {
  return useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const res = await fetch('/api/organizations')
      return res.ok ? res.json() : []
    },
    staleTime: 10 * 60 * 1000, // 10 min (org changes rarely)
  })
}

export function useWorkspacesQuery(organizations) {
  return useQuery({
    queryKey: ['workspaces', organizations.map(o => o.id).sort()],
    queryFn: async () => {
      const res = await fetch('/api/workspaces')
      return res.ok ? res.json() : {}
    },
    enabled: organizations.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

// Component usage
export function SettingsPage() {
  const { data: orgs } = useOrganizationsQuery()
  const { data: workspaces } = useWorkspacesQuery(orgs || [])

  return (
    <>
      {orgs?.map(org => (
        <div key={org.id}>
          {workspaces?.[org.id]?.map(ws => (
            <WorkspaceCard key={ws.id} workspace={ws} />
          ))}
        </div>
      ))}
    </>
  )
}
```

### User Authentication

```typescript
function useUserQuery() {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await fetch('/api/user')
      if (res.status === 401) return null
      return res.ok ? res.json() : null
    },
    // Keep user cached for 5 min (settings opened repeatedly)
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  })
}

export function useAuth() {
  const { data: user = null, isLoading, refetch } = useUserQuery()

  return { user, isLoading, isAuthenticated: !!user, refetch }
}
```

---

## Performance Optimization Checklist

- [ ] **Set staleTime > 0** for all queries (prevents unnecessary refetches)
- [ ] **Use Query Key Factory** (prevents drift, enables bulk invalidation)
- [ ] **Enable request deduplication** (automatic, verify in DevTools)
- [ ] **Avoid waterfalls** (use `enabled` flag for dependent queries)
- [ ] **Prefetch on hover** (anticipate user actions)
- [ ] **Implement optimistic updates** (mutations feel instant)
- [ ] **Use Suspense boundaries** (skeleton UI improves UX)
- [ ] **Monitor with DevTools** (`@tanstack/react-query-devtools`)
- [ ] **Configure global defaults** (less per-query boilerplate)
- [ ] **Plan cache invalidation** (after mutations, on errors)

---

## Debugging with DevTools

```bash
npm install @tanstack/react-query-devtools --save-dev
```

```typescript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

export function App() {
  return (
    <>
      {/* Your app */}
      <ReactQueryDevtools initialIsOpen={false} />
    </>
  )
}
```

**What to look for:**
- Query status (fresh/stale/inactive)
- Last updated timestamp
- Cache duration remaining
- Request/response data
- Error messages
- Refetch triggers

---

## Common Mistakes to Avoid

### ❌ Setting staleTime = gcTime
```typescript
// Wrong - no background refetching window
staleTime: 5 * 60 * 1000,
gcTime: 5 * 60 * 1000, // Same as staleTime
```

### ✅ gcTime > staleTime
```typescript
// Correct - allows stale-while-revalidate
staleTime: 5 * 60 * 1000,  // Fresh for 5 min
gcTime: 30 * 60 * 1000,    // Keep for 30 min
```

### ❌ Not using enabled for dependent queries
```typescript
// Creates waterfall
const { data: posts } = useQuery({
  queryKey: ['posts', userId],
  queryFn: () => fetchPosts(userId), // userId might be undefined!
})
```

### ✅ Conditional query execution
```typescript
const { data: posts } = useQuery({
  queryKey: ['posts', userId],
  queryFn: () => fetchPosts(userId),
  enabled: !!userId, // Only runs when userId is available
})
```

### ❌ Using object literals in queryKey
```typescript
// Wrong - new object instance each render
useQuery({
  queryKey: ['user', { id: userId, admin: true }],
  queryFn: fetchUser,
})
```

### ✅ Stable queryKey
```typescript
// Correct
useQuery({
  queryKey: ['user', userId, 'admin'],
  queryFn: fetchUser,
})
```

---

## When to Use TanStack Query

**Perfect for:**
- Server state (API data)
- Caching HTTP responses
- Background refetching
- Settings/dashboard pages
- Multiple data sources

**Not ideal for:**
- Complex client-side logic (use Zustand/Redux)
- Single value state (use useState)
- Form state (use React Hook Form)

**Can coexist with:**
- Zustand (separate concerns: server vs client state)
- Redux (legacy apps migrating)
- Context (local component state)

---

## References & Further Reading

- [TanStack Query Official Docs](https://tanstack.com/query/latest)
- [Important Defaults Guide](https://tanstack.com/query/v5/docs/react/guides/important-defaults)
- [Caching Examples](https://tanstack.com/query/v5/docs/react/guides/caching)
- [Request Waterfalls Prevention](https://tanstack.com/query/v5/docs/react/guides/request-waterfalls)
- [TkDodo's Blog - React Query Best Practices](https://tanstack.com/query/v4/docs/react/community/tkdodos-blog)
- [Master Caching in React Query](https://manishgcodes.medium.com/master-caching-in-react-query-reduce-network-requests-and-improve-performance-868291494d40)
- [2026 Architecture Guide: RSC + TanStack Query](https://dev.to/krish_kakadiya_5f0eaf6342/react-server-components-tanstack-query-the-2026-data-fetching-power-duo-you-cant-ignore-21fj)
- [Zero to Mastery React Query Guide](https://zerotomastery.io/blog/react-query/)

---

## Quick Reference: Cache Timeline

```
Query created with staleTime=5min, gcTime=30min

Timeline:
0-5 min:   Data is FRESH
           └─ No automatic refetch
           └─ If used, serves cached data
           └─ Fast ⚡

5-30 min:  Data is STALE
           └─ If accessed, refetch in background
           └─ Shows old data immediately (stale-while-revalidate)
           └─ New data arrives when ready
           └─ Fast ⚡

>30 min:   Query is INACTIVE (not in use) for >30min
           └─ Garbage collected and deleted
           └─ Memory freed
```

---

## Template: Implementing TanStack Query

### Step 1: Install
```bash
bun add @tanstack/react-query
```

### Step 2: Set up QueryClient
```typescript
// lib/providers/QueryClientProvider.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function QueryProvider({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

### Step 3: Wrap app
```typescript
// app/layout.tsx
<QueryProvider>
  {children}
</QueryProvider>
```

### Step 4: Create query hooks
```typescript
// lib/hooks/useData.ts
import { useQuery } from '@tanstack/react-query'

export function useUserData(userId) {
  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetch(`/api/user/${userId}`).then(r => r.json()),
    staleTime: 10 * 60 * 1000,
  })
}
```

### Step 5: Use in components
```typescript
function UserProfile({ userId }) {
  const { data, isLoading, error } = useUserData(userId)

  if (isLoading) return <Skeleton />
  if (error) return <Error />
  return <Profile user={data} />
}
```

Done! 🚀
