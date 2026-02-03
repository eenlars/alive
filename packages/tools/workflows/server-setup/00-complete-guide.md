# Hono + TanStack Router + Vite: Production Setup Guide

A complete guide to setting up a full-stack TypeScript application with:
- **Hono** - Fast, lightweight backend API server
- **TanStack Router** - Type-safe file-based routing for React
- **Vite** - Frontend build tool with HMR
- **Bun** - Fast JavaScript runtime (can substitute with Node.js)

---

## The Mental Model: Why This Architecture?

Before diving into code, understand what we're building and why each piece exists.

### The Problem We're Solving

You want a single codebase that produces:
1. A **React frontend** (SPA) with type-safe routing
2. A **backend API** that serves data
3. Both working together seamlessly in development AND production

### The Two-Server Development Model

**In development**, you run TWO servers:

```
┌─────────────────────────────────────────────────────────────────────┐
│  DEVELOPMENT: Two servers, one entry point                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Browser → Vite Dev Server ─┬─→ Static files (React, CSS, JS)       │
│                             │   with Hot Module Replacement (HMR)    │
│                             │                                        │
│                             └─→ /api/* → PROXY → Hono API Server    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why two servers?**
- Vite provides instant HMR for frontend code (sub-100ms refreshes)
- Hono runs your backend logic separately
- The Vite proxy makes them appear as one server to the browser

**In production**, you run ONE server:

```
┌─────────────────────────────────────────────────────────────────────┐
│  PRODUCTION: Single server serves everything                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Browser → Hono Server ─┬─→ /api/* → API route handlers             │
│                         │                                            │
│                         └─→ /* → Static files from dist/client/     │
│                                  (pre-built React bundle)            │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

**Why single server in production?**
- Simpler deployment (one process)
- No proxy overhead
- Static files are pre-built, no HMR needed

### The Separate TypeScript Configs

You need TWO tsconfig files because frontend and backend have different requirements:

| Requirement | Backend (src/) | Frontend (client/) |
|-------------|----------------|-------------------|
| JSX | No | Yes (`react-jsx`) |
| DOM APIs | No | Yes (`DOM`, `DOM.Iterable`) |
| Module Resolution | `node` (for Bun/Node) | `bundler` (for Vite) |
| Output | Compiled JS | Vite handles bundling |

### The File-Based Routing Concept

TanStack Router generates code from your file structure:

```
client/routes/
├── __root.tsx      →  Root layout (wraps everything)
├── index.tsx       →  / (home)
├── about.tsx       →  /about
├── users/
│   ├── index.tsx   →  /users
│   └── $id.tsx     →  /users/:id (dynamic segment)
└── _auth/          →  Layout group (underscore = no URL segment)
    ├── login.tsx   →  /login
    └── signup.tsx  →  /signup
```

The Vite plugin watches these files and generates `routeTree.gen.ts` automatically. You never edit this file - it's the "compiled" route tree.

---

## Architecture Overview

```
your-project/
├── src/                    # Backend (Hono API server)
│   └── server.ts           # Main Hono server
├── client/                 # Frontend (React + TanStack Router)
│   ├── index.html          # Entry HTML
│   ├── main.tsx            # React entry point
│   ├── tsconfig.json       # Client-specific TS config
│   ├── routes/             # File-based routes
│   │   ├── __root.tsx      # Root layout
│   │   └── index.tsx       # Home page (/)
│   └── routeTree.gen.ts    # Auto-generated route tree
├── package.json
├── tsconfig.json           # Server TS config
└── vite.config.ts          # Vite configuration
```

**Key insight**: The frontend lives in `client/` with its own `tsconfig.json`. Vite's `root` is set to `client/`. The backend runs separately and Vite proxies `/api` requests to it during development.

---

## Step 1: Install Dependencies

```bash
# Core dependencies
bun add hono @tanstack/react-router react react-dom

# Dev dependencies
bun add -d vite @vitejs/plugin-react @tanstack/router-vite-plugin \
  @tanstack/router-devtools typescript @types/react @types/react-dom \
  concurrently
```

If using npm/pnpm:
```bash
npm install hono @tanstack/react-router react react-dom
npm install -D vite @vitejs/plugin-react @tanstack/router-vite-plugin \
  @tanstack/router-devtools typescript @types/react @types/react-dom \
  concurrently
```

---

## Step 2: Configure package.json

```json
{
  "name": "your-app",
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n api,vite -c blue,green \"bun dev:api\" \"bun dev:client\"",
    "dev:api": "bun --watch src/server.ts",
    "dev:client": "vite",
    "build": "vite build",
    "start": "NODE_ENV=production bun src/server.ts"
  }
}
```

**What each script does:**
- `dev` - Runs both API and Vite in parallel with colored output
- `dev:api` - Runs Hono server with hot reload
- `dev:client` - Runs Vite dev server
- `build` - Builds frontend for production
- `start` - Runs production server (serves both API and static files)

---

## Step 3: Create vite.config.ts

```typescript
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import react from "@vitejs/plugin-react"
import { createLogger, defineConfig } from "vite"

// Optional: Suppress proxy errors when API is down during development
const logger = createLogger()
const originalError = logger.error.bind(logger)
logger.error = (msg, options) => {
  if (msg.includes("http proxy error")) return
  originalError(msg, options)
}

export default defineConfig({
  customLogger: logger,
  plugins: [
    react(),
    TanStackRouterVite({
      routesDirectory: "./routes",           // Relative to client/
      generatedRouteTree: "./routeTree.gen.ts",
      quoteStyle: "double",
    }),
  ],
  root: "client",                            // Frontend lives here
  build: {
    outDir: "../dist/client",                // Build output
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",     // Your Hono server
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            // Return 503 when API is down instead of crashing
            if (res && !res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ error: "API unavailable" }))
            }
          })
        },
      },
    },
  },
})
```

**Critical settings:**
- `root: "client"` - Tells Vite the frontend is in `client/`
- `routesDirectory: "./routes"` - Relative to `client/`, so `client/routes/`
- Proxy `/api` to Hono server during development

---

## Step 4: Create TypeScript Configs

### Root tsconfig.json (for backend)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022"],
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "client"]
}
```

### client/tsconfig.json (for frontend)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["./**/*"],
  "exclude": ["node_modules", "dist", ".well-known", "fonts"]
}
```

**Why two configs?**
- Backend needs `"module": "ESNext"` with `"moduleResolution": "node"` for Bun/Node
- Frontend needs `"jsx": "react-jsx"`, DOM libs, and `"moduleResolution": "bundler"` for Vite

---

## Step 5: Create the Hono Server

### src/server.ts

```typescript
import { Hono } from "hono"
import { serveStatic } from "hono/bun"  // Use hono/node-server for Node.js
import { cors } from "hono/cors"

const app = new Hono()
const PORT = process.env.PORT || 3001

// Enable CORS for development
app.use("*", cors())

// =============================================================================
// API Routes
// =============================================================================

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() })
})

app.get("/api/example", (c) => {
  return c.json({ message: "Hello from Hono!" })
})

app.post("/api/example", async (c) => {
  const body = await c.req.json()
  return c.json({ received: body })
})

// Add more routes as needed...
// app.get("/api/users", (c) => { ... })
// app.post("/api/users", async (c) => { ... })

// =============================================================================
// Static Files (Production Only)
// =============================================================================

if (process.env.NODE_ENV === "production") {
  // Serve built frontend assets
  app.use("/*", serveStatic({ root: "./dist/client" }))

  // SPA fallback - serve index.html for client-side routing
  app.get("*", serveStatic({ path: "./dist/client/index.html" }))
}

// =============================================================================
// Export for Bun
// =============================================================================

export default {
  port: PORT,
  fetch: app.fetch,
}

// For Node.js, use this instead:
// import { serve } from "@hono/node-server"
// serve({ fetch: app.fetch, port: Number(PORT) })
// console.log(`Server running on http://localhost:${PORT}`)
```

---

## Step 6: Create the Frontend Entry Point

### client/index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Your App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

### client/main.tsx

```typescript
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { routeTree } from "./routeTree.gen"

// Create the router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",  // Preload on hover/focus
})

// Register router for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Mount the app
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
)
```

---

## Step 7: Create Route Files

### client/routes/__root.tsx

The root layout wraps all pages. This is where you put navigation, providers, etc.

```typescript
import { Outlet, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/router-devtools"

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1>404 - Page Not Found</h1>
      <a href="/">Go Home</a>
    </div>
  ),
})

function RootComponent() {
  return (
    <>
      {/* Your app shell: navbar, sidebar, etc. */}
      <Outlet />

      {/* Dev tools - only shown in development */}
      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-left" />}
    </>
  )
}
```

### client/routes/index.tsx

The home page at `/`.

```typescript
import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"

export const Route = createFileRoute("/")({
  component: HomePage,
})

function HomePage() {
  const [data, setData] = useState<{ message: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/example")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Welcome</h1>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <p>API says: {data?.message}</p>
      )}
    </div>
  )
}
```

---

## Step 8: Adding More Routes

TanStack Router uses **file-based routing**. The file path becomes the URL path.

| File | URL |
|------|-----|
| `routes/index.tsx` | `/` |
| `routes/about.tsx` | `/about` |
| `routes/users/index.tsx` | `/users` |
| `routes/users/$id.tsx` | `/users/:id` (dynamic) |
| `routes/settings/profile.tsx` | `/settings/profile` |

### Example: Dynamic Route

**client/routes/users/$id.tsx**

```typescript
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/users/$id")({
  component: UserPage,
})

function UserPage() {
  const { id } = Route.useParams()

  return (
    <div>
      <h1>User {id}</h1>
    </div>
  )
}
```

### Example: Route with Loader

```typescript
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/users/$id")({
  loader: async ({ params }) => {
    const res = await fetch(`/api/users/${params.id}`)
    if (!res.ok) throw new Error("User not found")
    return res.json()
  },
  component: UserPage,
  errorComponent: ({ error }) => <div>Error: {error.message}</div>,
  pendingComponent: () => <div>Loading...</div>,
})

function UserPage() {
  const user = Route.useLoaderData()
  return <div>{user.name}</div>
}
```

---

## Step 9: Run the App

```bash
# Development (runs both servers)
bun dev

# Or run separately
bun dev:api    # Terminal 1: Hono on :3001
bun dev:client # Terminal 2: Vite on :5173

# Production build
bun run build

# Production server (serves API + static files)
bun start
```

**Development URLs:**
- Frontend: http://localhost:5173
- API: http://localhost:3001/api/... (or via proxy at :5173/api/...)

**Production:**
- Everything served from http://localhost:3001

---

## How It All Connects

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DEVELOPMENT                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Browser ──► Vite (:5173) ──┬──► /api/* ──► Proxy ──► Hono (:3001)  │
│                             │                                        │
│                             └──► /* ──► React + HMR                  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Browser ──► Hono (:3001) ──┬──► /api/* ──► API handlers            │
│                             │                                        │
│                             └──► /* ──► Static files (dist/client)  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Production Checklist

1. **Environment variables**: Use `.env` for secrets, never commit them
2. **CORS**: Disable or configure properly for production
3. **Error handling**: Add proper error boundaries and API error responses
4. **Build output**: `dist/client/` contains your built frontend
5. **Static serving**: Hono serves the built files in production mode

---

## Common Patterns

### API Client Helper

**client/lib/api.ts**

```typescript
const API_BASE = "/api"

export async function api<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  })

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: "Unknown error" }))
    throw new Error(error.error || `HTTP ${res.status}`)
  }

  return res.json()
}

// Usage:
// const users = await api<User[]>("/users")
// await api("/users", { method: "POST", body: JSON.stringify(data) })
```

### Navigation with Type Safety

```typescript
import { Link, useNavigate } from "@tanstack/react-router"

function Nav() {
  const navigate = useNavigate()

  return (
    <nav>
      {/* Type-safe links */}
      <Link to="/">Home</Link>
      <Link to="/users/$id" params={{ id: "123" }}>User 123</Link>

      {/* Programmatic navigation */}
      <button onClick={() => navigate({ to: "/about" })}>
        Go to About
      </button>
    </nav>
  )
}
```

---

## Troubleshooting

### "routeTree.gen.ts not found"

Run `bun dev:client` once - the TanStack Router plugin auto-generates it.

### API calls fail in development

Check that your Hono server is running on port 3001. The Vite proxy only works when the target server is up.

### Type errors in route files

Make sure you have the `declare module "@tanstack/react-router"` block in `main.tsx` to register the router type.

### Production build doesn't serve routes

Ensure the SPA fallback is configured in Hono:
```typescript
app.get("*", serveStatic({ path: "./dist/client/index.html" }))
```

---

## Adding Tailwind CSS (Optional)

```bash
bun add -d tailwindcss @tailwindcss/vite
```

Update `vite.config.ts`:
```typescript
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),  // Add this
    TanStackRouterVite({ ... }),
  ],
  // ...
})
```

Create `client/styles.css`:
```css
@import "tailwindcss";
```

Import in `__root.tsx`:
```typescript
import "../styles.css"
```

---

## Summary

| Component | Port | Role |
|-----------|------|------|
| Vite | 5173 | Dev server, HMR, proxies /api |
| Hono | 3001 | API server, serves static in prod |
| TanStack Router | - | File-based routing, type-safe |

**The magic**: In development, you get instant HMR for the frontend while the API runs separately. In production, Hono serves everything from a single port.

---

## Package Deep Dive

### Core Packages Explained

| Package | Version | Purpose |
|---------|---------|---------|
| `hono` | ^4.x | Ultra-fast web framework (~14KB). Express-like API but runs anywhere (Bun, Node, Cloudflare Workers, Deno). |
| `@tanstack/react-router` | ^1.x | Type-safe router with file-based routing, loaders, and search params. |
| `react` | ^18.x or ^19.x | UI library. |
| `react-dom` | ^18.x or ^19.x | React DOM renderer. |

### Dev Packages Explained

| Package | Purpose |
|---------|---------|
| `vite` | Build tool with native ESM, fast HMR, and optimized production builds. |
| `@vitejs/plugin-react` | Vite plugin for React Fast Refresh and JSX transform. |
| `@tanstack/router-vite-plugin` | Auto-generates route tree from file structure. |
| `@tanstack/router-devtools` | Visual devtools for inspecting router state (dev only). |
| `typescript` | Type checking. |
| `@types/react` | React type definitions. |
| `@types/react-dom` | React DOM type definitions. |
| `concurrently` | Run multiple npm scripts in parallel. |

### Optional But Recommended

| Package | Purpose | Install |
|---------|---------|---------|
| `zod` | Runtime schema validation | `bun add zod` |
| `tailwindcss` | Utility-first CSS | `bun add -d tailwindcss @tailwindcss/vite` |
| `zustand` | Lightweight state management | `bun add zustand` |
| `better-sqlite3` | SQLite for Bun/Node | `bun add better-sqlite3` |
| `@biomejs/biome` | Fast linter/formatter | `bun add -d @biomejs/biome` |

---

## Hono Deep Dive

### Why Hono?

- **Fast**: Built on Web Standards (Request/Response), no abstraction overhead
- **Lightweight**: ~14KB, no dependencies
- **Universal**: Same code runs on Bun, Node.js, Cloudflare Workers, Deno, AWS Lambda
- **TypeScript-first**: Full type inference for routes

### Hono Middleware

Middleware runs before your route handlers. Order matters.

```typescript
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { secureHeaders } from "hono/secure-headers"
import { compress } from "hono/compress"
import { etag } from "hono/etag"
import { timing } from "hono/timing"

const app = new Hono()

// 1. Timing headers (Server-Timing)
app.use("*", timing())

// 2. Request logging
app.use("*", logger())

// 3. Security headers (X-Frame-Options, etc.)
app.use("*", secureHeaders())

// 4. CORS (configure for production!)
app.use("*", cors({
  origin: process.env.NODE_ENV === "production"
    ? "https://yourdomain.com"
    : "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE"],
  allowHeaders: ["Content-Type", "Authorization"],
}))

// 5. Compression (gzip/brotli)
app.use("*", compress())

// 6. ETags for caching
app.use("*", etag())
```

### Request Validation with Zod

```typescript
import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"

const app = new Hono()

// Define schema
const CreateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
})

// Validate request body
app.post(
  "/api/users",
  zValidator("json", CreateUserSchema),
  async (c) => {
    const data = c.req.valid("json") // Fully typed!
    // data.name, data.email, data.age are typed
    return c.json({ created: data })
  }
)

// Validate query params
const SearchSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().default(1),
  limit: z.coerce.number().default(20),
})

app.get(
  "/api/search",
  zValidator("query", SearchSchema),
  (c) => {
    const { q, page, limit } = c.req.valid("query")
    return c.json({ q, page, limit })
  }
)
```

Install: `bun add @hono/zod-validator zod`

### Route Groups

Organize routes into groups with shared prefixes and middleware.

```typescript
import { Hono } from "hono"

const app = new Hono()

// Public routes
const publicApi = new Hono()
publicApi.get("/health", (c) => c.json({ status: "ok" }))
publicApi.get("/version", (c) => c.json({ version: "1.0.0" }))

// Protected routes (with auth middleware)
const protectedApi = new Hono()
protectedApi.use("*", async (c, next) => {
  const token = c.req.header("Authorization")
  if (!token) return c.json({ error: "Unauthorized" }, 401)
  // Validate token...
  await next()
})
protectedApi.get("/me", (c) => c.json({ user: "..." }))
protectedApi.get("/settings", (c) => c.json({ settings: "..." }))

// Mount groups
app.route("/api", publicApi)
app.route("/api/user", protectedApi)

// Results in:
// GET /api/health
// GET /api/version
// GET /api/user/me (requires auth)
// GET /api/user/settings (requires auth)
```

### Error Handling

```typescript
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"

const app = new Hono()

// Global error handler
app.onError((err, c) => {
  console.error(`[ERROR] ${err.message}`)

  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status)
  }

  return c.json(
    { error: "Internal Server Error" },
    500
  )
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404)
})

// Throwing errors in routes
app.get("/api/users/:id", async (c) => {
  const user = await db.getUser(c.req.param("id"))
  if (!user) {
    throw new HTTPException(404, { message: "User not found" })
  }
  return c.json(user)
})
```

### Running on Node.js

If you're not using Bun, use `@hono/node-server`:

```bash
npm install @hono/node-server
```

```typescript
// src/server.ts
import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"

const app = new Hono()

// ... your routes ...

// Static files for Node.js (different import!)
if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/client" }))
  app.get("*", serveStatic({ path: "./dist/client/index.html" }))
}

serve({
  fetch: app.fetch,
  port: 3001,
})

console.log("Server running on http://localhost:3001")
```

Update package.json:
```json
{
  "scripts": {
    "dev:api": "tsx watch src/server.ts",
    "start": "NODE_ENV=production node dist/server.js"
  }
}
```

---

## TanStack Router Deep Dive

### Why TanStack Router?

- **Type-safe**: Routes, params, search params, loaders all fully typed
- **File-based**: No manual route registration
- **Built-in data loading**: Loaders with caching and deduplication
- **Search params**: First-class URL search parameter support
- **Devtools**: Visual debugging

### Route Configuration Options

```typescript
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/users/$id")({
  // Validate params
  parseParams: (params) => ({
    id: Number(params.id),
  }),
  stringifyParams: (params) => ({
    id: String(params.id),
  }),

  // Search params (URL query string)
  validateSearch: (search) => ({
    tab: (search.tab as string) || "profile",
    page: Number(search.page) || 1,
  }),

  // Load data before rendering
  loader: async ({ params, context }) => {
    const user = await fetch(`/api/users/${params.id}`).then(r => r.json())
    return { user }
  },

  // Pending UI while loading
  pendingComponent: () => <div>Loading user...</div>,

  // Error UI
  errorComponent: ({ error }) => (
    <div>Error: {error.message}</div>
  ),

  // The actual component
  component: UserPage,

  // Before loading, check conditions
  beforeLoad: async ({ params }) => {
    // Redirect, throw, or return context
  },
})

function UserPage() {
  const { user } = Route.useLoaderData()
  const { id } = Route.useParams()
  const { tab, page } = Route.useSearch()

  return <div>...</div>
}
```

### Search Params (Query Strings)

TanStack Router makes URL search params type-safe:

```typescript
// routes/products.tsx
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { z } from "zod"

// Define search param schema
const ProductSearchSchema = z.object({
  category: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  sort: z.enum(["price", "name", "rating"]).default("name"),
  page: z.number().default(1),
})

type ProductSearch = z.infer<typeof ProductSearchSchema>

export const Route = createFileRoute("/products")({
  validateSearch: (search): ProductSearch =>
    ProductSearchSchema.parse(search),

  component: ProductsPage,
})

function ProductsPage() {
  const search = Route.useSearch()
  const navigate = useNavigate()

  // Update search params
  const setCategory = (category: string) => {
    navigate({
      search: (prev) => ({ ...prev, category, page: 1 }),
    })
  }

  const setPage = (page: number) => {
    navigate({
      search: (prev) => ({ ...prev, page }),
    })
  }

  return (
    <div>
      <p>Category: {search.category}</p>
      <p>Sort: {search.sort}</p>
      <p>Page: {search.page}</p>

      <button onClick={() => setCategory("electronics")}>
        Electronics
      </button>
      <button onClick={() => setPage(search.page + 1)}>
        Next Page
      </button>
    </div>
  )
}
```

URL: `/products?category=electronics&sort=price&page=2`

### Layout Routes

Create shared layouts for groups of routes:

```
client/routes/
├── __root.tsx           # App shell
├── index.tsx            # /
├── _dashboard.tsx       # Layout for /dashboard/*
├── _dashboard/
│   ├── index.tsx        # /dashboard
│   ├── analytics.tsx    # /dashboard/analytics
│   └── settings.tsx     # /dashboard/settings
└── about.tsx            # /about
```

**`_dashboard.tsx`** (underscore = layout, not a route):

```typescript
import { Outlet, createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard")({
  component: DashboardLayout,
})

function DashboardLayout() {
  return (
    <div className="dashboard">
      <aside>
        <nav>
          <Link to="/dashboard">Overview</Link>
          <Link to="/dashboard/analytics">Analytics</Link>
          <Link to="/dashboard/settings">Settings</Link>
        </nav>
      </aside>
      <main>
        <Outlet /> {/* Child routes render here */}
      </main>
    </div>
  )
}
```

**`_dashboard/index.tsx`**:

```typescript
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_dashboard/")({
  component: () => <h1>Dashboard Overview</h1>,
})
```

### Lazy Loading Routes

For large apps, lazy-load route components:

```typescript
// routes/heavy-page.tsx
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/heavy-page")({
  component: () => import("../components/HeavyComponent").then(m => m.default),
})
```

Or use `lazy` in the route tree:

```typescript
// routes/heavy-page.lazy.tsx
import { createLazyFileRoute } from "@tanstack/react-router"

export const Route = createLazyFileRoute("/heavy-page")({
  component: HeavyPage,
})

function HeavyPage() {
  return <div>This component is lazy loaded</div>
}
```

---

## Shared Types Between Client & Server

Create a `shared/` folder for types used by both:

```
your-project/
├── src/
├── client/
├── shared/
│   └── types.ts
└── ...
```

### shared/types.ts

```typescript
// API Response types
export interface User {
  id: number
  name: string
  email: string
  createdAt: string
}

export interface ApiError {
  error: string
  code?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

// API Request types
export interface CreateUserRequest {
  name: string
  email: string
}

export interface UpdateUserRequest {
  name?: string
  email?: string
}
```

### Update tsconfig files

**Root tsconfig.json:**
```json
{
  "include": ["src/**/*", "shared/**/*"]
}
```

**client/tsconfig.json:**
```json
{
  "include": ["./**/*", "../shared/**/*"]
}
```

### Usage

**Server (src/server.ts):**
```typescript
import type { User, CreateUserRequest } from "../shared/types"

app.post("/api/users", async (c) => {
  const body: CreateUserRequest = await c.req.json()
  const user: User = await createUser(body)
  return c.json(user)
})
```

**Client (client/routes/users.tsx):**
```typescript
import type { User, PaginatedResponse } from "../../shared/types"

const response = await fetch("/api/users")
const data: PaginatedResponse<User> = await response.json()
```

---

## State Management with Zustand

Zustand is a tiny (~1KB) state manager that works great with React:

```bash
bun add zustand
```

### client/stores/user-store.ts

```typescript
import { create } from "zustand"
import { persist } from "zustand/middleware"

interface User {
  id: number
  name: string
  email: string
}

interface UserStore {
  user: User | null
  isLoading: boolean
  error: string | null

  // Actions
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      user: null,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null })
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          })
          if (!res.ok) throw new Error("Login failed")
          const user = await res.json()
          set({ user, isLoading: false })
        } catch (err) {
          set({ error: (err as Error).message, isLoading: false })
        }
      },

      logout: () => {
        set({ user: null })
        fetch("/api/auth/logout", { method: "POST" })
      },

      fetchUser: async () => {
        set({ isLoading: true })
        try {
          const res = await fetch("/api/auth/me")
          if (res.ok) {
            const user = await res.json()
            set({ user, isLoading: false })
          } else {
            set({ user: null, isLoading: false })
          }
        } catch {
          set({ user: null, isLoading: false })
        }
      },
    }),
    {
      name: "user-store", // localStorage key
      partialize: (state) => ({ user: state.user }), // Only persist user
    }
  )
)
```

### Usage in Components

```typescript
import { useUserStore } from "../stores/user-store"

function Header() {
  const { user, logout } = useUserStore()

  if (!user) return <Link to="/login">Login</Link>

  return (
    <div>
      <span>Welcome, {user.name}</span>
      <button onClick={logout}>Logout</button>
    </div>
  )
}
```

---

## Database Setup (SQLite with better-sqlite3)

SQLite is perfect for small-to-medium apps. Zero configuration, file-based.

```bash
bun add better-sqlite3
bun add -d @types/better-sqlite3
```

### src/db.ts

```typescript
import Database from "better-sqlite3"

// Create/open database
const db = new Database("data.db")

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL")

// =============================================================================
// Schema
// =============================================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    published INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`)

// =============================================================================
// Migrations (safe to run multiple times)
// =============================================================================

// Add columns safely
try {
  db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT")
} catch {
  // Column already exists
}

try {
  db.exec("ALTER TABLE posts ADD COLUMN slug TEXT")
} catch {
  // Column already exists
}

// =============================================================================
// Prepared Statements (faster than raw queries)
// =============================================================================

export const queries = {
  // Users
  getUserById: db.prepare("SELECT * FROM users WHERE id = $id"),
  getUserByEmail: db.prepare("SELECT * FROM users WHERE email = $email"),
  createUser: db.prepare(`
    INSERT INTO users (name, email, password_hash)
    VALUES ($name, $email, $password_hash)
  `),
  updateUser: db.prepare(`
    UPDATE users SET name = $name, email = $email, updated_at = CURRENT_TIMESTAMP
    WHERE id = $id
  `),
  deleteUser: db.prepare("DELETE FROM users WHERE id = $id"),

  // Posts
  getPostsByUser: db.prepare(`
    SELECT * FROM posts WHERE user_id = $user_id ORDER BY created_at DESC
  `),
  getPublishedPosts: db.prepare(`
    SELECT p.*, u.name as author_name
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.published = 1
    ORDER BY p.created_at DESC
    LIMIT $limit OFFSET $offset
  `),
  createPost: db.prepare(`
    INSERT INTO posts (user_id, title, content, slug)
    VALUES ($user_id, $title, $content, $slug)
  `),
}

// =============================================================================
// Type-safe query helpers
// =============================================================================

export interface UserRow {
  id: number
  name: string
  email: string
  password_hash: string
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface PostRow {
  id: number
  user_id: number
  title: string
  content: string
  slug: string | null
  published: number
  created_at: string
}

export function getUserById(id: number): UserRow | null {
  return queries.getUserById.get({ $id: id }) as UserRow | null
}

export function createUser(name: string, email: string, passwordHash: string): number {
  const result = queries.createUser.run({
    $name: name,
    $email: email,
    $password_hash: passwordHash,
  })
  return Number(result.lastInsertRowid)
}

export { db }
```

### Using in Routes

```typescript
import { getUserById, createUser, type UserRow } from "./db"

app.get("/api/users/:id", (c) => {
  const user = getUserById(Number(c.req.param("id")))
  if (!user) return c.json({ error: "User not found" }, 404)

  // Don't expose password hash!
  const { password_hash, ...safeUser } = user
  return c.json(safeUser)
})
```

---

## Environment Variables

### .env (never commit this!)

```bash
# Server
PORT=3001
NODE_ENV=development

# Database
DATABASE_URL=./data.db

# Auth
JWT_SECRET=your-super-secret-key-change-in-production
SESSION_SECRET=another-secret-key

# External APIs
API_KEY=sk-xxx
```

### .env.example (commit this as template)

```bash
PORT=3001
NODE_ENV=development
DATABASE_URL=./data.db
JWT_SECRET=change-me
SESSION_SECRET=change-me
API_KEY=
```

### Loading in Bun

Bun auto-loads `.env`:

```typescript
// src/server.ts
const PORT = process.env.PORT || 3001
const JWT_SECRET = process.env.JWT_SECRET!

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required")
}
```

### Loading in Node.js

```bash
npm install dotenv
```

```typescript
import "dotenv/config"
// or
import dotenv from "dotenv"
dotenv.config()
```

### Type-safe Environment Variables

Create `src/env.ts`:

```typescript
import { z } from "zod"

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().default("./data.db"),
  JWT_SECRET: z.string().min(32),
  API_KEY: z.string().optional(),
})

export const env = EnvSchema.parse(process.env)

// Usage:
// import { env } from "./env"
// console.log(env.PORT) // number
// console.log(env.NODE_ENV) // "development" | "production" | "test"
```

---

## Authentication Pattern

### JWT-based Auth

```bash
bun add hono jose
```

**src/auth.ts:**

```typescript
import { SignJWT, jwtVerify } from "jose"
import { getCookie, setCookie, deleteCookie } from "hono/cookie"
import type { Context, MiddlewareHandler } from "hono"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)
const COOKIE_NAME = "auth_token"

export interface JWTPayload {
  userId: number
  email: string
}

// Create JWT token
export async function createToken(payload: JWTPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET)
}

// Verify JWT token
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as JWTPayload
  } catch {
    return null
  }
}

// Set auth cookie
export function setAuthCookie(c: Context, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "Lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  })
}

// Clear auth cookie
export function clearAuthCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME)
}

// Auth middleware
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, COOKIE_NAME)

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401)
  }

  const payload = await verifyToken(token)
  if (!payload) {
    clearAuthCookie(c)
    return c.json({ error: "Invalid token" }, 401)
  }

  // Attach user to context
  c.set("user", payload)
  await next()
}

// Type augmentation for context
declare module "hono" {
  interface ContextVariableMap {
    user: JWTPayload
  }
}
```

**Usage in routes:**

```typescript
import { Hono } from "hono"
import { authMiddleware, createToken, setAuthCookie, clearAuthCookie } from "./auth"
import { getUserByEmail, getUserById } from "./db"
import { hashPassword, verifyPassword } from "./password" // implement with bcrypt/argon2

const app = new Hono()

// Public: Login
app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json()

  const user = getUserByEmail(email)
  if (!user || !await verifyPassword(password, user.password_hash)) {
    return c.json({ error: "Invalid credentials" }, 401)
  }

  const token = await createToken({ userId: user.id, email: user.email })
  setAuthCookie(c, token)

  const { password_hash, ...safeUser } = user
  return c.json(safeUser)
})

// Public: Logout
app.post("/api/auth/logout", (c) => {
  clearAuthCookie(c)
  return c.json({ ok: true })
})

// Protected routes
const protectedRoutes = new Hono()
protectedRoutes.use("*", authMiddleware)

protectedRoutes.get("/me", (c) => {
  const { userId } = c.get("user")
  const user = getUserById(userId)
  if (!user) return c.json({ error: "User not found" }, 404)

  const { password_hash, ...safeUser } = user
  return c.json(safeUser)
})

app.route("/api/auth", protectedRoutes)
```

---

## Testing Setup

### Install Vitest

```bash
bun add -d vitest @testing-library/react @testing-library/dom jsdom
```

### vitest.config.ts

```typescript
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
  },
})
```

### test/setup.ts

```typescript
import "@testing-library/jest-dom"
```

### Testing API Routes

```typescript
// test/api.test.ts
import { describe, it, expect } from "vitest"
import app from "../src/server"

describe("API", () => {
  it("GET /api/health returns ok", async () => {
    const res = await app.request("/api/health")
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe("ok")
  })

  it("POST /api/users creates user", async () => {
    const res = await app.request("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", email: "test@example.com" }),
    })
    expect(res.status).toBe(201)
  })
})
```

### Testing React Components

```typescript
// test/components.test.tsx
import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { Button } from "../client/components/Button"

describe("Button", () => {
  it("renders with text", () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText("Click me")).toBeInTheDocument()
  })
})
```

### Package.json scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

---

## Deployment

### Docker

**Dockerfile:**

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Build
FROM deps AS build
COPY . .
RUN bun run build

# Production
FROM base AS production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./

ENV NODE_ENV=production
EXPOSE 3001

CMD ["bun", "src/server.ts"]
```

**docker-compose.yml:**

```yaml
version: "3.8"
services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./data:/app/data  # Persist SQLite
```

### Railway / Render / Fly.io

These platforms auto-detect Bun/Node projects. Just push your repo.

**For Bun projects**, add to package.json:

```json
{
  "engines": {
    "bun": ">=1.0.0"
  }
}
```

**Build command:** `bun run build`
**Start command:** `bun start`

### Vercel (Serverless)

Hono works on Vercel Edge Functions:

```bash
bun add @hono/vercel
```

**api/index.ts:**

```typescript
import { handle } from "@hono/vercel"
import app from "../src/server"

export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
```

**vercel.json:**

```json
{
  "buildCommand": "bun run build",
  "outputDirectory": "dist/client",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api" }
  ]
}
```

---

## Linting & Formatting with Biome

Biome is a fast alternative to ESLint + Prettier:

```bash
bun add -d @biomejs/biome
```

### biome.json

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "warn",
        "noUnusedImports": "warn"
      },
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "tab",
    "lineWidth": 100
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "asNeeded"
    }
  },
  "files": {
    "ignore": ["node_modules", "dist", "*.gen.ts"]
  }
}
```

### Package.json scripts

```json
{
  "scripts": {
    "lint": "biome lint .",
    "lint:fix": "biome lint --write .",
    "format": "biome format --write .",
    "check": "biome check .",
    "check:fix": "biome check --write ."
  }
}
```

---

## Complete package.json Reference

```json
{
  "name": "my-fullstack-app",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "concurrently -k -n api,vite -c blue,green \"bun dev:api\" \"bun dev:client\"",
    "dev:api": "bun --watch src/server.ts",
    "dev:client": "vite",
    "build": "bun run type-check && vite build",
    "start": "NODE_ENV=production bun src/server.ts",
    "type-check": "tsc --noEmit",
    "lint": "biome lint .",
    "lint:fix": "biome lint --write .",
    "format": "biome format --write .",
    "check": "biome check .",
    "check:fix": "biome check --write .",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "@tanstack/react-router": "^1.139.0",
    "hono": "^4.10.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0",
    "zustand": "^5.0.0",
    "better-sqlite3": "^11.0.0",
    "jose": "^5.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "@tanstack/router-devtools": "^1.139.0",
    "@tanstack/router-vite-plugin": "^1.139.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^9.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.0.0"
  }
}
```

---

## Quick Start Checklist

```bash
# 1. Create project
mkdir my-app && cd my-app
bun init -y

# 2. Install deps
bun add hono @tanstack/react-router react react-dom zod zustand
bun add -d vite @vitejs/plugin-react @tanstack/router-vite-plugin \
  @tanstack/router-devtools typescript @types/react @types/react-dom \
  concurrently tailwindcss @tailwindcss/vite @biomejs/biome

# 3. Create structure
mkdir -p src client/routes shared

# 4. Create files (copy from this guide):
#    - package.json (scripts)
#    - vite.config.ts
#    - tsconfig.json
#    - client/tsconfig.json
#    - client/index.html
#    - client/main.tsx
#    - client/styles.css
#    - client/routes/__root.tsx
#    - client/routes/index.tsx
#    - src/server.ts
#    - biome.json

# 5. Run
bun dev
```

Open http://localhost:5173 and you're ready to build.

---

## Common Mistakes & Pitfalls

These are the errors you WILL encounter. Save yourself hours of debugging.

### 1. Wrong `root` in vite.config.ts

**Symptom**: Vite can't find `index.html`, routes don't generate

**The mistake**:
```typescript
// WRONG - default vite assumes index.html is in project root
export default defineConfig({
  plugins: [react(), TanStackRouterVite()],
})
```

**The fix**:
```typescript
// CORRECT - tell Vite the frontend is in client/
export default defineConfig({
  root: "client",  // <-- THIS IS CRITICAL
  plugins: [
    react(),
    TanStackRouterVite({
      routesDirectory: "./routes",        // Relative to root (client/)
      generatedRouteTree: "./routeTree.gen.ts",
    }),
  ],
})
```

### 2. Route file doesn't export `Route`

**Symptom**: Page is blank, no errors, route doesn't work

**The mistake**:
```typescript
// WRONG - missing named export
import { createFileRoute } from "@tanstack/react-router"

const Route = createFileRoute("/about")({
  component: AboutPage,
})  // <-- Not exported!

function AboutPage() { ... }
```

**The fix**:
```typescript
// CORRECT - must be a named export called "Route"
export const Route = createFileRoute("/about")({
  component: AboutPage,
})
```

### 3. Path string doesn't match file location

**Symptom**: TypeScript error about route path, route 404s

**The mistake**:
```typescript
// File: client/routes/users/$id.tsx
// WRONG - path doesn't match file structure
export const Route = createFileRoute("/user/$id")({  // should be /users/$id
  component: UserPage,
})
```

**The fix**: The path in `createFileRoute()` MUST match the file's position:

| File Location | Path String |
|---------------|-------------|
| `routes/index.tsx` | `"/"` |
| `routes/about.tsx` | `"/about"` |
| `routes/users/index.tsx` | `"/users/"` |
| `routes/users/$id.tsx` | `"/users/$id"` |
| `routes/_layout/dashboard.tsx` | `"/_layout/dashboard"` |

### 4. Forgetting the router type registration

**Symptom**: `Link` and `useNavigate` have `any` types, no autocomplete

**The mistake**: Missing the module augmentation in `main.tsx`

**The fix**:
```typescript
// client/main.tsx
const router = createRouter({ routeTree })

// THIS BLOCK IS REQUIRED for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
```

### 5. API proxy not working in development

**Symptom**: `/api/...` returns 404 or HTML instead of JSON

**Possible causes**:

1. **API server not running**: The Vite proxy forwards requests, but if Hono isn't listening, it fails. Start both servers.

2. **Wrong proxy target**: Make sure the port matches your API server:
```typescript
// vite.config.ts
proxy: {
  "/api": {
    target: `http://localhost:${process.env.API_PORT || 3001}`,
  },
}
```

3. **CORS issues**: In development, Hono should have CORS enabled:
```typescript
import { cors } from "hono/cors"
app.use("*", cors())
```

### 6. Production build serves 404 for routes

**Symptom**: Direct URL access (e.g., `/users/123`) returns 404 in production

**The cause**: SPA routing requires ALL routes to serve `index.html`, then React Router handles the path client-side.

**The fix**: Add SPA fallback in Hono:
```typescript
if (process.env.NODE_ENV === "production") {
  // Serve static assets
  app.use("/*", serveStatic({ root: "./dist/client" }))

  // SPA fallback - THIS LINE IS CRITICAL
  // Any route that isn't a file returns index.html
  app.get("*", serveStatic({ path: "./dist/client/index.html" }))
}
```

### 7. Import path confusion between client and server

**Symptom**: "Cannot find module" errors, wrong file imported

**The cause**: Relative imports behave differently in `src/` vs `client/`

**The fix**: Use the `shared/` folder pattern for shared types:
```
shared/types.ts     # Shared interfaces
src/server.ts       # import from "../shared/types"
client/routes/...   # import from "../../shared/types"
```

### 8. `routeTree.gen.ts` not found

**Symptom**: Import error on first run

**The cause**: This file is generated by the Vite plugin on first run

**The fix**: Run `bun dev:client` (or `npm run dev:client`) once. The plugin generates the file automatically. If it still fails, check that `routesDirectory` in your Vite config points to a folder with at least `__root.tsx`.

### 9. Environment variables not loading

**Symptom**: `process.env.XXX` is undefined

**In Bun**: `.env` loads automatically - just create the file

**In Node.js**: You need `dotenv`:
```typescript
import "dotenv/config"  // Add at top of server.ts
```

**In Vite (frontend)**: Only `VITE_*` prefixed vars are exposed:
```bash
# .env
VITE_API_URL=https://api.example.com  # Available in client
SECRET_KEY=xxx                          # NOT available in client (good!)
```

```typescript
// client code
const apiUrl = import.meta.env.VITE_API_URL
```

### 10. Different behavior in dev vs production

**Common issues**:

| Issue | Dev Behavior | Prod Behavior | Fix |
|-------|-------------|---------------|-----|
| API calls | Via Vite proxy | Direct to Hono | Use relative URLs (`/api/...`) |
| Static files | Vite serves | Hono serves | Check `serveStatic` config |
| HMR | Works | N/A | Expected |
| Source maps | Available | May be missing | Add `sourcemap: true` in vite build |
| CORS | Usually works | May fail | Configure properly for prod domain |

---

## Configurable Ports (Best Practice)

Hardcoding ports is fragile. Use environment variables:

### .env

```bash
# Development
VITE_PORT=5173
API_PORT=3001

# Or use any ports you want
VITE_PORT=3000
API_PORT=4000
```

### vite.config.ts

```typescript
export default defineConfig({
  // ...
  server: {
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT || 3001}`,
      },
    },
  },
})
```

### src/server.ts

```typescript
const PORT = process.env.API_PORT || process.env.PORT || 3001

export default {
  port: PORT,
  fetch: app.fetch,
}
```

### package.json

```json
{
  "scripts": {
    "dev": "concurrently -k \"bun dev:api\" \"bun dev:client\"",
    "dev:api": "bun --watch src/server.ts",
    "dev:client": "vite"
  }
}
```

Now you can run on any ports:

```bash
# Default ports
bun dev

# Custom ports
API_PORT=4000 VITE_PORT=3000 bun dev
```

---

## The Minimal Working Setup (Copy-Paste Ready)

If you want the absolute minimum to get started:

### 1. Install

```bash
bun add hono @tanstack/react-router react react-dom
bun add -d vite @vitejs/plugin-react @tanstack/router-vite-plugin typescript @types/react @types/react-dom concurrently
```

### 2. package.json scripts

```json
{
  "type": "module",
  "scripts": {
    "dev": "concurrently -k \"bun --watch src/server.ts\" \"vite\"",
    "build": "vite build",
    "start": "NODE_ENV=production bun src/server.ts"
  }
}
```

### 3. vite.config.ts

```typescript
import { TanStackRouterVite } from "@tanstack/router-vite-plugin"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), TanStackRouterVite()],
  root: "client",
  build: { outDir: "../dist/client" },
  server: {
    proxy: { "/api": "http://localhost:3001" },
  },
})
```

### 4. tsconfig.json (root)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["client"]
}
```

### 5. client/tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM"],
    "noEmit": true
  },
  "include": ["."]
}
```

### 6. src/server.ts

```typescript
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { cors } from "hono/cors"

const app = new Hono()
app.use("*", cors())

app.get("/api/hello", (c) => c.json({ message: "Hello!" }))

if (process.env.NODE_ENV === "production") {
  app.use("/*", serveStatic({ root: "./dist/client" }))
  app.get("*", serveStatic({ path: "./dist/client/index.html" }))
}

export default { port: 3001, fetch: app.fetch }
```

### 7. client/index.html

```html
<!DOCTYPE html>
<html><head><title>App</title></head>
<body><div id="root"></div><script type="module" src="/main.tsx"></script></body>
</html>
```

### 8. client/main.tsx

```typescript
import { RouterProvider, createRouter } from "@tanstack/react-router"
import { createRoot } from "react-dom/client"
import { routeTree } from "./routeTree.gen"

const router = createRouter({ routeTree })
declare module "@tanstack/react-router" { interface Register { router: typeof router } }

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />)
```

### 9. client/routes/__root.tsx

```typescript
import { Outlet, createRootRoute } from "@tanstack/react-router"
export const Route = createRootRoute({ component: () => <Outlet /> })
```

### 10. client/routes/index.tsx

```typescript
import { createFileRoute } from "@tanstack/react-router"
export const Route = createFileRoute("/")({ component: () => <h1>Home</h1> })
```

### 11. Run

```bash
mkdir -p src client/routes
# Create files above
bun dev
# Open http://localhost:5173
```

That's it. 11 files, ~50 lines of actual code, fully working full-stack app.

---

## Tailwind CSS Pitfalls

### Common Problem: Styling completely broken - page has no Tailwind utility classes

**Root Cause**: The tailwind.config.ts has incorrect content paths that don't match actual file locations.

**What happens**:
```typescript
// WRONG - paths don't match actual file locations
content: ["./pages/**", "./components/**", "./app/**", "./src/**"]
```

But actual source files are in `client/` directory:
- `client/components/`
- `client/pages/`
- `client/routes/`

Result: Tailwind can't find any classes to include, outputs only base layer (6.7KB) with zero utility classes.

**The fix**: Update content paths to include `client/`:
```typescript
content: [
  "./client/**/*.{ts,tsx}",
  "./src/**/*.{ts,tsx}",
]
```

**Before & After**:
- CSS before: 6,750 bytes (base only, no utilities)
- CSS after: 22,083 bytes (full Tailwind utilities like .flex, .bg-*, .text-*, etc.)

---

## Final Summary

| Component | Dev Port | Prod Port | Role |
|-----------|----------|-----------|------|
| Vite | 5173 | - | Dev server, HMR, proxies /api |
| Hono | 3001 | 3001 | API server, serves static in prod |
| TanStack Router | - | - | File-based routing, type-safe |

**The architecture works because:**
1. Vite on the exposed port handles frontend + HMR in dev
2. Hono on internal port handles API in dev (via proxy)
3. In production, Hono serves both static files and API

This is the solid, production-ready pattern used by modern full-stack teams.
