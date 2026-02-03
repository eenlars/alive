export const runtime = "nodejs"

import { NextResponse } from "next/server"
import Database from "better-sqlite3"
import path from "node:path"

const DB_PATH = path.join(process.cwd(), "../../use_this_to_remember.db")

interface MemoryRow {
  id: string
  type: string
  topic: string
  content: string
  context: string
  tags: string
  created_at: string
}

// GET /api/priorities - Fetch all business priorities
export async function GET() {
  try {
    const db = new Database(DB_PATH, { readonly: true })

    const rows = db
      .prepare(`
      SELECT id, type, topic, content, context, tags, created_at
      FROM memories
      WHERE type = 'todo' AND tags LIKE '%philips-feedback%'
      ORDER BY created_at ASC
    `)
      .all() as MemoryRow[]

    db.close()

    const priorities = rows.map(row => {
      let tags: string[] = []
      try {
        tags = JSON.parse(row.tags || "[]")
      } catch {
        tags = []
      }

      // Determine status from tags
      let status: "not_started" | "in_progress" | "done" | "blocked" = "not_started"
      if (tags.includes("done")) status = "done"
      else if (tags.includes("in_progress")) status = "in_progress"
      else if (tags.includes("blocked")) status = "blocked"

      return {
        id: row.id,
        topic: row.topic,
        content: row.content,
        context: row.context,
        status,
        tags,
      }
    })

    return NextResponse.json({ ok: true, priorities })
  } catch (error) {
    console.error("Failed to fetch priorities:", error)
    return NextResponse.json({ ok: false, error: "Failed to fetch priorities" }, { status: 500 })
  }
}

// PATCH /api/priorities - Update priority status
export async function PATCH(request: Request) {
  try {
    const { id, status } = await request.json()

    if (!id || !status) {
      return NextResponse.json({ ok: false, error: "Missing id or status" }, { status: 400 })
    }

    const validStatuses = ["not_started", "in_progress", "done", "blocked"]
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 })
    }

    const db = new Database(DB_PATH)

    // Get current tags
    const row = db.prepare("SELECT tags FROM memories WHERE id = ?").get(id) as { tags: string } | undefined

    if (!row) {
      db.close()
      return NextResponse.json({ ok: false, error: "Priority not found" }, { status: 404 })
    }

    let tags: string[] = []
    try {
      tags = JSON.parse(row.tags || "[]")
    } catch {
      tags = []
    }

    // Remove old status tags
    tags = tags.filter(t => !["not_started", "in_progress", "done", "blocked"].includes(t))

    // Add new status tag (except for not_started which is default)
    if (status !== "not_started") {
      tags.push(status)
    }

    // Update tags
    db.prepare("UPDATE memories SET tags = ? WHERE id = ?").run(JSON.stringify(tags), id)

    db.close()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Failed to update priority:", error)
    return NextResponse.json({ ok: false, error: "Failed to update priority" }, { status: 500 })
  }
}
