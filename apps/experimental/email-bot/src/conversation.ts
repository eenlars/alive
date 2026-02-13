import Database from "better-sqlite3"
import { mkdirSync } from "node:fs"
import path from "node:path"
import type { ConversationMessage } from "./types.js"

/**
 * SQLite-backed conversation thread store.
 * Tracks email threads by Message-ID / In-Reply-To / References headers.
 */

const DB_PATH = path.join(import.meta.dirname, "..", "data", "conversations.db")

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  mkdirSync(path.dirname(DB_PATH), { recursive: true })

  db = new Database(DB_PATH)
  db.pragma("journal_mode = WAL")
  db.pragma("busy_timeout = 5000")

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mailbox TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      message_id TEXT UNIQUE,
      in_reply_to TEXT,
      sender TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_thread ON conversations(mailbox, thread_id);
    CREATE INDEX IF NOT EXISTS idx_message_id ON conversations(message_id);
  `)

  return db
}

/**
 * Resolve the thread ID for an email.
 * Uses In-Reply-To and References headers to find existing thread,
 * or creates a new thread based on the Message-ID.
 */
export function resolveThreadId(
  mailbox: string,
  messageId: string,
  inReplyTo: string | null,
  references: string[],
): string {
  const db = getDb()

  // Check if we have a thread matching In-Reply-To
  if (inReplyTo) {
    const existing = db
      .prepare("SELECT thread_id FROM conversations WHERE message_id = ? AND mailbox = ?")
      .get(inReplyTo, mailbox) as { thread_id: string } | undefined
    if (existing) return existing.thread_id
  }

  // Check References headers (oldest first)
  for (const ref of references) {
    const existing = db
      .prepare("SELECT thread_id FROM conversations WHERE message_id = ? AND mailbox = ?")
      .get(ref, mailbox) as { thread_id: string } | undefined
    if (existing) return existing.thread_id
  }

  // New thread — use this message's ID as the thread ID
  return messageId
}

/**
 * Get conversation history for a thread, ordered by creation time.
 */
export function getThreadHistory(mailbox: string, threadId: string): ConversationMessage[] {
  const db = getDb()
  return db
    .prepare("SELECT * FROM conversations WHERE mailbox = ? AND thread_id = ? ORDER BY created_at ASC")
    .all(mailbox, threadId) as ConversationMessage[]
}

/**
 * Get the count of messages in a thread.
 */
export function getThreadDepth(mailbox: string, threadId: string): number {
  const db = getDb()
  const result = db
    .prepare("SELECT COUNT(*) as count FROM conversations WHERE mailbox = ? AND thread_id = ?")
    .get(mailbox, threadId) as { count: number }
  return result.count
}

/**
 * Store a message (incoming or outgoing) in the conversation thread.
 */
export function storeMessage(
  mailbox: string,
  threadId: string,
  messageId: string,
  inReplyTo: string | null,
  sender: string,
  subject: string | null,
  body: string,
  direction: "incoming" | "outgoing",
): void {
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO conversations (mailbox, thread_id, message_id, in_reply_to, sender, subject, body, direction)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(mailbox, threadId, messageId, inReplyTo, sender, subject, body, direction)
}

/**
 * Close the database connection cleanly.
 */
export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
