import { Hono } from "hono"
import { cors } from "hono/cors"
import { Database } from "bun:sqlite"

// Initialize SQLite database (bun:sqlite is built-in, no npm package needed)
// Database file is stored in the project root
const db = new Database("data.db")

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

const app = new Hono()

// CORS for dev (Vite on different port)
app.use(
  "/api/*",
  cors({
    origin: origin => origin,
    credentials: true,
  }),
)

// Health check
app.get("/api/health", c => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() })
})

// ============================================
// ADD YOUR API ROUTES HERE
// ============================================

// Example: Get all items
// app.get('/api/items', (c) => {
//   const items = db.query('SELECT * FROM items ORDER BY created_at DESC').all()
//   return c.json(items)
// })

// Example: Create an item
// app.post('/api/items', async (c) => {
//   const body = await c.req.json()
//   const id = crypto.randomUUID()
//
//   db.query(`
//     INSERT INTO items (id, name, description, status)
//     VALUES (?, ?, ?, ?)
//   `).run(id, body.name, body.description || null, body.status || 'active')
//
//   return c.json({ id, ...body }, 201)
// })

// ============================================

// ============================================
// Static file serving (production only)
// ============================================

const isProduction = process.env.NODE_ENV === "production"

if (isProduction) {
  const { serveStatic } = await import("hono/bun")
  app.use("/*", serveStatic({ root: "./dist" }))
  app.get("*", serveStatic({ path: "./dist/index.html" }))
}

// ============================================

const PORT = process.env.API_PORT || process.env.PORT || 4000

console.log(`${isProduction ? "Production" : "API"} server running on http://localhost:${PORT}`)

export default {
  port: PORT,
  fetch: app.fetch,
}
