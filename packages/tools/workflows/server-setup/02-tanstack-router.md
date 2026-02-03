# TanStack Router Deep Dive

Complete guide for file-based routing with TanStack Router in Vite + React projects.

---

## Why TanStack Router?

- **Type-safe routing**: Full TypeScript support with inferred params
- **File-based routing**: Convention over configuration
- **Built-in search params**: Type-safe query strings
- **Loaders & actions**: Data fetching at the route level
- **Devtools**: Great debugging experience

---

## Installation

```bash
bun add @tanstack/react-router
bun add -D @tanstack/router-plugin @tanstack/router-devtools
```

---

## Project Structure

```
client/
├── routes/
│   ├── __root.tsx        # Root layout (wraps all routes)
│   ├── index.tsx         # "/" route
│   ├── about.tsx         # "/about" route
│   ├── blog/
│   │   ├── index.tsx     # "/blog" route
│   │   └── $postId.tsx   # "/blog/:postId" route (dynamic)
│   └── _layout.tsx       # Shared layout (optional)
├── routeTree.gen.ts      # Auto-generated route tree
└── main.tsx              # App entry point
```

---

## Vite Plugin Setup

```typescript
// vite.config.ts
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react-swc"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./client/routes",
      generatedRouteTree: "./client/routeTree.gen.ts",
    }),
    react(),
  ],
})
```

---

## Root Layout

The `__root.tsx` file is required and wraps all routes:

```typescript
// client/routes/__root.tsx
import { createRootRoute, Outlet, Link } from "@tanstack/react-router"

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen">
      <nav className="p-4 border-b">
        <Link to="/" className="mr-4">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  ),
})
```

---

## Basic Routes

### Index Route (/)

```typescript
// client/routes/index.tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  return (
    <div>
      <h1>Welcome Home</h1>
    </div>
  )
}
```

### Static Route (/about)

```typescript
// client/routes/about.tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/about")({
  component: AboutPage,
})

function AboutPage() {
  return <h1>About Us</h1>
}
```

---

## Dynamic Routes

Use `$` prefix for dynamic segments:

```typescript
// client/routes/blog/$postId.tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/blog/$postId")({
  component: BlogPost,
})

function BlogPost() {
  const { postId } = Route.useParams()

  return <h1>Blog Post: {postId}</h1>
}
```

---

## Data Loading

### Route Loaders

```typescript
// client/routes/blog/$postId.tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/blog/$postId")({
  loader: async ({ params }) => {
    const res = await fetch(`/api/posts/${params.postId}`)
    if (!res.ok) throw new Error("Post not found")
    return res.json()
  },
  component: BlogPost,
})

function BlogPost() {
  const post = Route.useLoaderData()

  return (
    <article>
      <h1>{post.title}</h1>
      <p>{post.content}</p>
    </article>
  )
}
```

### Pending UI

```typescript
export const Route = createFileRoute("/blog/$postId")({
  loader: async ({ params }) => {
    // ... fetch data
  },
  pendingComponent: () => <div>Loading post...</div>,
  errorComponent: ({ error }) => <div>Error: {error.message}</div>,
  component: BlogPost,
})
```

---

## Search Params (Query Strings)

### Define Search Params Schema

```typescript
// client/routes/search.tsx
import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

const searchSchema = z.object({
  q: z.string().optional(),
  page: z.number().catch(1),
  sort: z.enum(["asc", "desc"]).catch("desc"),
})

export const Route = createFileRoute("/search")({
  validateSearch: searchSchema,
  component: SearchPage,
})

function SearchPage() {
  const { q, page, sort } = Route.useSearch()

  return (
    <div>
      <p>Query: {q}</p>
      <p>Page: {page}</p>
      <p>Sort: {sort}</p>
    </div>
  )
}
```

### Navigate with Search Params

```typescript
import { Link, useNavigate } from "@tanstack/react-router"

// Declarative
<Link to="/search" search={{ q: "hello", page: 1 }}>
  Search
</Link>

// Imperative
const navigate = useNavigate()
navigate({ to: "/search", search: { q: "hello", page: 1 } })
```

---

## Layouts

### Pathless Layout

Use `_layout.tsx` for shared layouts without affecting the URL:

```typescript
// client/routes/dashboard/_layout.tsx
import { createFileRoute, Outlet } from "@tanstack/react-router"

export const Route = createFileRoute("/dashboard/_layout")({
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <div className="flex">
      <aside className="w-64 border-r p-4">
        <nav>Dashboard Nav</nav>
      </aside>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  )
}
```

### Nested Layout Routes

```
routes/
└── dashboard/
    ├── _layout.tsx      # Layout wrapper
    ├── index.tsx        # /dashboard
    ├── settings.tsx     # /dashboard/settings
    └── profile.tsx      # /dashboard/profile
```

---

## Navigation

### Link Component

```typescript
import { Link } from "@tanstack/react-router"

// Basic link
<Link to="/about">About</Link>

// With params
<Link to="/blog/$postId" params={{ postId: "123" }}>
  Post 123
</Link>

// Active styling
<Link
  to="/about"
  activeProps={{ className: "font-bold text-blue-600" }}
>
  About
</Link>

// Preload on hover
<Link to="/blog" preload="intent">Blog</Link>
```

### Programmatic Navigation

```typescript
import { useNavigate, useRouter } from "@tanstack/react-router"

function Component() {
  const navigate = useNavigate()
  const router = useRouter()

  const handleClick = () => {
    navigate({ to: "/dashboard" })
  }

  const handleBack = () => {
    router.history.back()
  }

  return (
    <>
      <button onClick={handleClick}>Go to Dashboard</button>
      <button onClick={handleBack}>Go Back</button>
    </>
  )
}
```

---

## App Entry Point

```typescript
// client/main.tsx
import React from "react"
import ReactDOM from "react-dom/client"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

const router = createRouter({ routeTree })

// Type registration for full type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
```

---

## Devtools

### Development Only

```typescript
// client/routes/__root.tsx
import { TanStackRouterDevtools } from "@tanstack/router-devtools"

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {import.meta.env.DEV && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </>
  ),
})
```

### Disable Completely

Simply don't import or render the devtools component.

---

## Route Guards / Authentication

```typescript
// client/routes/dashboard.tsx
import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async ({ context }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: "/login",
        search: { redirect: "/dashboard" },
      })
    }
  },
  component: Dashboard,
})
```

### Auth Context

```typescript
// client/main.tsx
const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // Will be set by provider
  },
})

// Wrap with auth provider
<AuthProvider>
  <RouterProvider router={router} context={{ auth: useAuth() }} />
</AuthProvider>
```

---

## Error Handling

### Route-Level Error Boundary

```typescript
export const Route = createFileRoute("/risky")({
  errorComponent: ({ error, reset }) => (
    <div className="p-4 bg-red-100">
      <h2>Something went wrong!</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Try again</button>
    </div>
  ),
  component: RiskyComponent,
})
```

### Global Error Boundary

```typescript
// client/routes/__root.tsx
export const Route = createRootRoute({
  errorComponent: ({ error }) => (
    <div className="p-8 text-center">
      <h1>Oops! Something went wrong</h1>
      <pre>{error.message}</pre>
    </div>
  ),
  component: RootLayout,
})
```

---

## Common Patterns

### Catch-All Route (404)

```typescript
// client/routes/$.tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/$")({
  component: NotFound,
})

function NotFound() {
  return (
    <div className="text-center py-20">
      <h1 className="text-4xl font-bold">404</h1>
      <p>Page not found</p>
    </div>
  )
}
```

### Redirect Route

```typescript
// client/routes/old-path.tsx
import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/old-path")({
  beforeLoad: () => {
    throw redirect({ to: "/new-path" })
  },
})
```

---

## Troubleshooting

### Routes Not Updating

Run `bun run dev` to regenerate `routeTree.gen.ts`. The plugin watches for changes automatically.

### Type Errors

1. Make sure `routeTree.gen.ts` is generated
2. Register the router type in `main.tsx`
3. Restart TypeScript server if needed

### Hydration Mismatch

Make sure server and client render the same initial content. Avoid `Date.now()` or random values in SSR.

---

## References

- [TanStack Router Docs](https://tanstack.com/router/latest)
- [File-Based Routing](https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing)
- [Type Safety](https://tanstack.com/router/latest/docs/framework/react/guide/type-safety)
