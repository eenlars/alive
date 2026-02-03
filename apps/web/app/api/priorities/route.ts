export const runtime = "nodejs"

import { NextResponse } from "next/server"
import Database from "better-sqlite3"
import path from "node:path"
import { createErrorResponse } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"

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
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }
}

// PATCH /api/priorities - Update priority status
export async function PATCH(request: Request) {
  try {
    const { id, status } = await request.json()

    if (!id || !status) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, { field: !id ? "id" : "status" })
    }

    const validStatuses = ["not_started", "in_progress", "done", "blocked"]
    if (!validStatuses.includes(status)) {
      return createErrorResponse(ErrorCodes.VALIDATION_ERROR, 400, { field: "status" })
    }

    const db = new Database(DB_PATH)

    // Get current tags
    const row = db.prepare("SELECT tags FROM memories WHERE id = ?").get(id) as { tags: string } | undefined

    if (!row) {
      db.close()
      return createErrorResponse(ErrorCodes.SITE_NOT_FOUND, 404, { resource: "priority" })
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
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500)
  }
}
