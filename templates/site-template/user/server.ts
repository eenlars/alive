import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { cors } from "hono/cors"
import { init, id } from "@instantdb/admin"

// Initialize InstantDB Admin
// Note: Create src/lib/instant.schema.ts and import it here for type safety
// import schema from './src/lib/instant.schema'

const db = init({
  appId: process.env.VITE_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_ADMIN_TOKEN!,
  // schema, // Uncomment when you have a schema
})

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

// Example: Get all items from a collection
// app.get('/api/items', async (c) => {
//   try {
//     const { items } = await db.query({ items: {} })
//     return c.json(items)
//   } catch (error) {
//     console.error('Error fetching items:', error)
//     return c.json({ error: 'Failed to fetch items' }, 500)
//   }
// })

// Example: Create an item
// app.post('/api/items', async (c) => {
//   try {
//     const body = await c.req.json()
//     const itemId = id()
//
//     await db.transact([
//       db.tx.items[itemId].update({
//         ...body,
//         createdAt: new Date().toISOString(),
//       })
//     ])
//
//     return c.json({ id: itemId, ...body }, 201)
//   } catch (error) {
//     console.error('Error creating item:', error)
//     return c.json({ error: 'Failed to create item' }, 500)
//   }
// })

// ============================================

const port = parseInt(process.env.API_PORT || "4000")

serve({ fetch: app.fetch, port }, () => {
  console.log(`🚀 API server running on http://localhost:${port}`)
})
