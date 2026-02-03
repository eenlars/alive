# Hono + Vite Server Migration Guide

Migrate your site to the solid single-port pattern for dev and production.

---

## The Problem

Sites need to work with a **single exposed port** (assigned by systemd), but in development you want:
- Vite for HMR (hot reload)
- Hono for API

**Solution**: Vite on PORT (exposed), API on PORT+1000 (internal), Vite proxies `/api/*`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DEVELOPMENT (PORT=3366 example)                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Browser ──► Vite (:3366) ──┬──► /api/* ──► Proxy ──► Hono (:4366)      │
│              (exposed)      │                        (internal)          │
│                             └──► /* ──► React + HMR                      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                         PRODUCTION (PORT=3366 example)                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Browser ──► Hono (:3366) ──┬──► /api/* ──► API handlers                │
│              (exposed)      │                                            │
│                             └──► /* ──► Static files (dist/)            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Key insight**: Only ONE port exposed. In dev, Vite occupies it and proxies API calls internally. In prod, Hono occupies it and serves everything.

---

## Step 1: Update vite.config.ts

```typescript
import path from "node:path"
import react from "@vitejs/plugin-react-swc"
import { createLogger, defineConfig } from "vite"

// Suppress proxy errors when API is down
const logger = createLogger()
const originalError = logger.error.bind(logger)
logger.error = (msg, options) => {
  if (msg.includes("http proxy error")) return
  originalError(msg, options)
}

// In dev: Vite on PORT (exposed), API on PORT+1000 (internal)
// In prod: API server handles everything on PORT
const PORT = Number(process.env.PORT) || 8080
const API_PORT = PORT + 1000

export default defineConfig({
  customLogger: logger,
  plugins: [react()],
  root: "client",  // Adjust if your frontend is in a different folder
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
  server: {
    host: "::",
    port: PORT,
    allowedHosts: true,  // Or specify: ["yourdomain.com"]
    proxy: {
      "/api": {
        target: `http://localhost:${API_PORT}`,
        configure: (proxy) => {
          proxy.on("error", (_err, _req, res) => {
            if (res && !res.headersSent) {
              res.writeHead(503, { "Content-Type": "application/json" })
              res.end(JSON.stringify({ error: "API unavailable" }))
            }
          })
        },
      },
    },
  },
  preview: {
    host: "::",
    port: PORT,
    allowedHosts: true,
  },
})
```

---

## Step 2: Update server.ts (or server/index.ts)

```typescript
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { cors } from "hono/cors"
import { logger } from "hono/logger"

const app = new Hono()

// In dev: use API_PORT (internal), in prod: use PORT (exposed)
const PORT = process.env.API_PORT || process.env.PORT || 8080

// Middleware
app.use("*", logger())
app.use("/api/*", cors({ origin: origin => origin, credentials: true }))

// =============================================================================
// API Routes
// =============================================================================

app.get("/api/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() })
})

// Add your routes here...

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

console.log(`Server running on http://localhost:${PORT}`)

export default {
  port: PORT,
  fetch: app.fetch,
}
```

---

## Step 3: Update package.json scripts

```json
{
  "scripts": {
    "dev": "concurrently -k -n api,vite -c blue,green \"bun dev:api\" \"bun dev:client\"",
    "dev:api": "API_PORT=$((${PORT:-8080} + 1000)) bun --watch server.ts",
    "dev:client": "vite",
    "build": "vite build",
    "start": "NODE_ENV=production bun server.ts"
  }
}
```

**What each script does:**
- `dev` - Runs both API and Vite in parallel
- `dev:api` - API on PORT+1000 (internal), with hot reload
- `dev:client` - Vite on PORT (exposed)
- `build` - Builds frontend for production
- `start` - Production mode: API on PORT serves everything

**Don't forget to add concurrently:**
```bash
bun add -d concurrently
```

---

## Step 4: Update systemd override (if needed)

Check current mode:
```bash
cat /etc/systemd/system/site@your-site.service.d/override.conf
```

For **dev mode**:
```ini
[Service]
ExecStart=
ExecStart=/bin/sh -c 'exec /usr/local/bin/bun run dev --port ${PORT:-3333} --host 0.0.0.0'
```

For **production mode**:
```ini
[Service]
ExecStart=
ExecStart=/bin/sh -c 'exec /usr/local/bin/bun run start --port ${PORT:-3333} --host 0.0.0.0'
```

After changes:
```bash
systemctl daemon-reload
systemctl restart site@your-site.service
```

---

## Quick Checklist

- [ ] `vite.config.ts`: Uses `PORT` env var, proxies `/api` to `PORT+1000`
- [ ] `server.ts`: Uses `API_PORT || PORT` pattern
- [ ] `package.json`: `dev:api` sets `API_PORT=$((${PORT:-8080} + 1000))`
- [ ] `package.json`: Has `start` script with `NODE_ENV=production`
- [ ] `concurrently` installed as dev dependency
- [ ] Production serves static files from `dist/client` (or `dist`)

---

## Verify It Works

```bash
# Check service logs
journalctl -u site@your-site.service -n 30 --no-pager

# Should see:
# [api] Server running on http://localhost:XXXX  (PORT+1000)
# [vite] VITE ready on http://localhost:XXXX     (PORT)

# Test locally
curl http://localhost:PORT/           # Should return HTML
curl http://localhost:PORT/api/health  # Should return JSON
```

---

## Common Issues

### Site returns 404 for everything

**Cause**: In dev mode, API doesn't serve frontend. Vite does.

**Fix**: Make sure both Vite AND API are running. Check logs for errors.

### API calls fail with CORS error

**Fix**: Add CORS middleware to API routes:
```typescript
app.use("/api/*", cors({ origin: origin => origin, credentials: true }))
```

### Constant page reloads in dev

**Cause**: Vite HMR WebSocket not working because you're proxying Vite through API.

**Fix**: Use the correct pattern - Vite should be the main server on PORT, not API.

### Permission denied on files

**Cause**: Files owned by root instead of site user.

**Fix**:
```bash
chown -R site-your-site:site-your-site /srv/webalive/sites/your-site/user/
```

---

## Summary

| Component | Port (Dev) | Port (Prod) | Role |
|-----------|------------|-------------|------|
| Vite | PORT (exposed) | - | Dev server, HMR, proxies /api |
| Hono | PORT+1000 (internal) | PORT (exposed) | API, serves static in prod |

**The pattern**:
- Single exposed port (systemd assigns it)
- Dev: Vite on PORT, proxies `/api` to internal API on PORT+1000
- Prod: Hono on PORT serves everything
