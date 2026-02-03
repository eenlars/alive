# Server Setup Guides

Complete reference for setting up full-stack TypeScript applications with **Hono + TanStack Router + Vite + Bun**.

---

## Quick Navigation

| Guide | Focus | Best For |
|-------|-------|----------|
| **[00-complete-guide.md](./00-complete-guide.md)** | Comprehensive everything-in-one reference | Learning from scratch, reference material |
| **[01-migration.md](./01-migration.md)** | Quick migration for existing sites | Moving to single-port architecture |
| **[02-tanstack-router.md](./02-tanstack-router.md)** | File-based routing deep dive | Understanding TanStack Router patterns |

---

## The Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  DEVELOPMENT: Two servers, Vite proxies API                     │
├─────────────────────────────────────────────────────────────────┤
│  Browser → Vite (:5173) ──┬──→ /api/* ──→ Hono (:3001)          │
│                           └──→ /* ──→ React + HMR               │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PRODUCTION: Single server (Hono) serves everything              │
├─────────────────────────────────────────────────────────────────┤
│  Browser → Hono (:3001) ──┬──→ /api/* ──→ API handlers          │
│                           └──→ /* ──→ Static files (dist/)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### Single Port Architecture

In production, you have **ONE exposed port** (from systemd). The API server (Hono) runs on that port and serves:
1. API routes at `/api/*`
2. Static frontend files at `/*`

### Development: Two Servers

- **Vite** on the exposed port (default 5173) → provides HMR for instant frontend updates
- **Hono** on an internal port (default 3001) → runs your backend
- Vite proxies `/api/*` requests to Hono so they appear as one server to the browser

### File-Based Routing

TanStack Router automatically generates a route tree from your file structure:

```
client/routes/
├── __root.tsx      →  Root layout
├── index.tsx       →  / (home)
├── about.tsx       →  /about
├── users/
│   ├── index.tsx   →  /users
│   └── $id.tsx     →  /users/:id
```

---

## Quick Start (5 minutes)

```bash
# 1. Install
bun add hono @tanstack/react-router react react-dom
bun add -d vite @vitejs/plugin-react @tanstack/router-vite-plugin \
  @tanstack/router-devtools typescript @types/react @types/react-dom \
  concurrently

# 2. Copy structure
mkdir -p src client/routes

# 3. Copy files from 00-complete-guide.md (minimal setup section)

# 4. Run
bun dev

# 5. Open http://localhost:5173
```

See **[00-complete-guide.md](./00-complete-guide.md)** § "The Minimal Working Setup" for copy-paste ready code.

---

## Common Use Cases

### "I have an existing site, how do I migrate?"

→ Read **[01-migration.md](./01-migration.md)**

Key points:
- Vite on exposed PORT
- API on PORT+1000 (internal)
- Vite proxies `/api/*` to internal port
- In production, API serves static files from `dist/client/`

### "I don't understand TanStack Router"

→ Read **[02-tanstack-router.md](./02-tanstack-router.md)**

Covers:
- File-based routing conventions
- Dynamic routes with `$paramName.tsx`
- Loaders for data fetching
- Type-safe navigation
- Search params (query strings)

### "I want everything in one place"

→ Read **[00-complete-guide.md](./00-complete-guide.md)**

Covers the entire stack:
- Hono (backend) deep dive
- TanStack Router (frontend) patterns
- Database (SQLite)
- Authentication (JWT)
- Testing (Vitest)
- Deployment (Docker, Vercel, etc.)
- Common mistakes & pitfalls

---

## The PORT Pattern (Critical!)

This is how you support both dev and prod with a single exposed port:

### In package.json:

```json
{
  "scripts": {
    "dev": "concurrently -k \"bun dev:api\" \"bun dev:client\"",
    "dev:api": "API_PORT=$((${PORT:-8080} + 1000)) bun --watch server.ts",
    "dev:client": "vite",
    "start": "NODE_ENV=production bun server.ts"
  }
}
```

### In vite.config.ts:

```typescript
const PORT = Number(process.env.PORT) || 8080
const API_PORT = PORT + 1000

export default defineConfig({
  server: {
    port: PORT,
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
      },
    },
  },
})
```

### In server.ts:

```typescript
const PORT = process.env.API_PORT || process.env.PORT || 8080
```

**How it works**:
- Dev: Vite runs on PORT (exposed), API on PORT+1000 (internal)
- Prod: API runs on PORT (exposed), serves static files

If PORT=3366:
- Dev: Vite on :3366, API on :4366
- Prod: API on :3366, serves everything

---

## File Structure

All guides assume this layout:

```
your-project/
├── src/                      # Backend
│   └── server.ts             # Hono app
├── client/                   # Frontend
│   ├── index.html            # Entry point
│   ├── main.tsx              # React entry
│   ├── routes/               # File-based routes
│   │   ├── __root.tsx        # Root layout
│   │   └── index.tsx         # Home page
│   └── tsconfig.json         # Frontend TS config
├── package.json
├── tsconfig.json             # Backend TS config
└── vite.config.ts
```

---

## Common Mistakes to Avoid

1. **Wrong Vite `root`**: Must be `root: "client"`
2. **Hardcoded ports**: Use `process.env.PORT` instead
3. **Missing type registration**: Add `declare module "@tanstack/react-router"` in main.tsx
4. **Route path doesn't match file location**: `/users/$id` route must be in `routes/users/$id.tsx`
5. **Forgetting SPA fallback**: In production, `app.get("*", serveStatic({ path: "./dist/client/index.html" }))`
6. **Wrong Tailwind content paths**: Update `tailwind.config.ts` to include `./client/**/*`

See **[00-complete-guide.md](./00-complete-guide.md)** § "Common Mistakes & Pitfalls" for detailed explanations.

---

## Troubleshooting

### API calls return 404 in development
- Ensure both `bun dev:api` and `bun dev:client` are running
- Check Vite proxy target matches API port: `http://localhost:${API_PORT}`
- Verify Hono has CORS enabled: `app.use("*", cors())`

### Routes return 404 in production
- Add SPA fallback: `app.get("*", serveStatic({ path: "./dist/client/index.html" }))`
- Ensure build output is in `dist/client/`: check `vite.config.ts` `outDir`

### `routeTree.gen.ts` not found
- Run `bun dev:client` once - the plugin auto-generates it
- Ensure `routes/` folder exists and has at least `__root.tsx`

### Environment variables undefined
- **Bun**: `.env` loads automatically
- **Node.js**: Add `import "dotenv/config"` at top of server
- **Vite frontend**: Only `VITE_*` prefixed vars are exposed

---

## Quick Reference

### Core Commands

```bash
# Development
bun dev                # Run both servers in parallel

# Separate terminals
bun dev:api           # Terminal 1: Hono API
bun dev:client        # Terminal 2: Vite frontend

# Production
bun run build         # Build frontend
bun start             # Run production server
```

### Key Files to Create

| File | Purpose |
|------|---------|
| `src/server.ts` | Hono app & API routes |
| `client/index.html` | HTML entry point |
| `client/main.tsx` | React entry |
| `client/routes/__root.tsx` | Root layout (required) |
| `vite.config.ts` | Vite configuration |
| `tsconfig.json` | Backend TypeScript |
| `client/tsconfig.json` | Frontend TypeScript |

### Key Dependencies

```bash
# Core
bun add hono @tanstack/react-router react react-dom

# Dev
bun add -d vite @vitejs/plugin-react @tanstack/router-vite-plugin \
  @tanstack/router-devtools typescript @types/react @types/react-dom \
  concurrently

# Optional
bun add zod zustand better-sqlite3 jose
bun add -d @biomejs/biome vitest
```

---

## Reading Guide

**If you have 5 minutes**: Read the "Quick Start" section above

**If you have 20 minutes**: Read [01-migration.md](./01-migration.md)

**If you have 1 hour**: Read [00-complete-guide.md](./00-complete-guide.md) focusing on sections relevant to your use case

**If you have time to learn deeply**: Read all three guides in order:
1. [00-complete-guide.md](./00-complete-guide.md) - Understand the big picture
2. [01-migration.md](./01-migration.md) - See concrete examples
3. [02-tanstack-router.md](./02-tanstack-router.md) - Master file-based routing

---

## More Guides Coming

Additional guides for specific topics (authentication, database, testing, deployment, etc.) will be added to this folder.

For now, refer to the relevant sections in **[00-complete-guide.md](./00-complete-guide.md)**.

---

## Support

- **TypeScript errors?** Check tsconfig files have correct `lib`, `moduleResolution`
- **Routes not working?** Verify file paths match route strings exactly
- **API not responding?** Ensure both servers are running and ports are correct
- **Build fails?** Run `bun run build` with `--debug` flag for more info

See the guides above for detailed troubleshooting sections.
