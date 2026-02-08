/**
 * Stream Buffer - Redis-backed persistence for SSE stream output
 *
 * Enables reconnection support by buffering stream messages.
 * When a client disconnects (e.g., logs out) and reconnects,
 * they can retrieve missed messages from the buffer.
 *
 * Buffer lifecycle:
 * 1. Created when stream starts (state: streaming)
 * 2. Messages appended as they arrive
 * 3. Marked complete when stream finishes
 * 4. Expires after TTL (30 minutes by default)
 */

import { getRedisUrl } from "@webalive/env/server"
import { createRedisClient } from "@webalive/redis"

// ============================================================================
// Types
// ============================================================================

export interface StreamBufferEntry {
  /** Unique request identifier */
  requestId: string
  /** Tab key for lookup (userId::workspace::tabId) */
  tabKey: string
  /** User who initiated the stream */
  userId: string
  /** Tab ID that initiated this stream (for routing on reconnect) */
  tabId?: string
  /** Current state of the stream */
  state: "streaming" | "complete" | "error"
  /** Buffered messages (NDJSON lines with sequence) */
  messages: Array<{ seq: number; line: string }>
  /** When the stream started */
  startedAt: number
  /** When the last message was received (for stale detection) */
  lastMessageAt: number
  /** When the stream completed (if applicable) */
  completedAt?: number
  /** Error message (if state is error) */
  error?: string
  /** Last stream sequence acknowledged by client (cursor) */
  lastReadSeq: number
}

// ============================================================================
// Constants
// ============================================================================

/** Redis key prefix for stream buffers */
const BUFFER_KEY_PREFIX = "stream-buffer:"

/** Buffer TTL: 30 minutes (in seconds) */
const BUFFER_TTL_SECONDS = 30 * 60

/** Maximum messages to buffer (prevents memory exhaustion) */
const MAX_BUFFERED_MESSAGES = 1000

/** Stale stream threshold: 5 minutes (in milliseconds) */
const STALE_STREAM_THRESHOLD_MS = 5 * 60 * 1000

// ============================================================================
// Singleton Redis Client
// ============================================================================

// In standalone mode, this will be null (Redis not available)
let redisClient: ReturnType<typeof createRedisClient> | null = null
let redisInitialized = false

function getRedis() {
  if (!redisInitialized) {
    // getRedisUrl() returns null in standalone mode
    redisClient = createRedisClient(getRedisUrl())
    redisInitialized = true
  }
  return redisClient
}

/**
 * Check if stream buffering is available
 * Returns false in standalone mode where Redis is not available
 */
export function isStreamBufferingAvailable(): boolean {
  return getRedis() !== null
}

// ============================================================================
// Buffer Operations
// ============================================================================

/**
 * Create a new stream buffer entry
 */
export async function createStreamBuffer(
  requestId: string,
  tabKey: string,
  userId: string,
  tabId?: string,
): Promise<void> {
  const redis = getRedis()

  // Standalone mode - no Redis, no buffering
  if (!redis) {
    console.log(`[StreamBuffer] Skipping buffer creation in standalone mode: ${requestId}`)
    return
  }

  const key = `${BUFFER_KEY_PREFIX}${requestId}`

  const now = Date.now()
  const entry: StreamBufferEntry = {
    requestId,
    tabKey,
    userId,
    tabId,
    state: "streaming",
    messages: [],
    startedAt: now,
    lastMessageAt: now,
    lastReadSeq: 0,
  }

  // Store with TTL
  await redis.setex(key, BUFFER_TTL_SECONDS, JSON.stringify(entry))

  // Also create a lookup by tab key (for reconnection)
  const lookupKey = `${BUFFER_KEY_PREFIX}tab:${tabKey}`
  await redis.setex(lookupKey, BUFFER_TTL_SECONDS, requestId)
}

/**
 * Lua script for atomic message append
 * Prevents race conditions in concurrent append operations
 *
 * ARGV[1]: stream sequence (number)
 * ARGV[2]: max messages limit
 * ARGV[3]: message to append
 * ARGV[4]: current timestamp (ms)
 *
 * Returns:
 *  -1: Buffer doesn't exist
 *   0: Buffer full
 *   1: Success
 */
const APPEND_SCRIPT = `
local entry = redis.call('GET', KEYS[1])
if not entry then return -1 end
local data = cjson.decode(entry)
local seq = tonumber(ARGV[1])
if not seq then return -2 end
if #data.messages >= tonumber(ARGV[2]) then return 0 end
table.insert(data.messages, {seq = seq, line = ARGV[3]})
data.lastMessageAt = tonumber(ARGV[4])
local ttl = redis.call('TTL', KEYS[1])
if ttl > 0 then
  redis.call('SETEX', KEYS[1], ttl, cjson.encode(data))
end
return 1
`

/**
 * Append a message to the stream buffer (atomic operation)
 * Returns false if buffer is full or doesn't exist
 *
 * Uses Lua script to prevent race conditions in concurrent appends
 */
export async function appendToStreamBuffer(requestId: string, message: string, streamSeq: number): Promise<boolean> {
  const redis = getRedis()
  if (!redis) return false // Standalone mode

  const key = `${BUFFER_KEY_PREFIX}${requestId}`

  const result = await redis.eval(
    APPEND_SCRIPT,
    1,
    key,
    streamSeq.toString(),
    MAX_BUFFERED_MESSAGES.toString(),
    message,
    Date.now().toString(),
  )

  if (result === -1) {
    return false // Buffer doesn't exist (expired or never created)
  }

  if (result === 0) {
    console.warn(`[StreamBuffer] Buffer full for ${requestId}, dropping message`)
    return false
  }

  if (result === -2) {
    console.warn(`[StreamBuffer] Missing stream sequence for ${requestId}, dropping message`)
    return false
  }

  return true
}

/**
 * Mark stream as complete
 */
export async function completeStreamBuffer(requestId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return // Standalone mode

  const key = `${BUFFER_KEY_PREFIX}${requestId}`

  const raw = await redis.get(key)
  if (!raw) return

  const entry: StreamBufferEntry = JSON.parse(raw)
  entry.state = "complete"
  entry.completedAt = Date.now()

  // Keep buffer alive for reconnection window (refresh TTL)
  await redis.setex(key, BUFFER_TTL_SECONDS, JSON.stringify(entry))
}

/**
 * Mark stream as errored
 */
export async function errorStreamBuffer(requestId: string, error: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return // Standalone mode

  const key = `${BUFFER_KEY_PREFIX}${requestId}`

  const raw = await redis.get(key)
  if (!raw) return

  const entry: StreamBufferEntry = JSON.parse(raw)
  entry.state = "error"
  entry.error = error
  entry.completedAt = Date.now()

  const ttl = await redis.ttl(key)
  if (ttl > 0) {
    await redis.setex(key, ttl, JSON.stringify(entry))
  }
}

/**
 * Get stream buffer by request ID
 */
export async function getStreamBuffer(requestId: string): Promise<StreamBufferEntry | null> {
  const redis = getRedis()
  if (!redis) return null // Standalone mode

  const key = `${BUFFER_KEY_PREFIX}${requestId}`

  const raw = await redis.get(key)
  if (!raw) return null

  return JSON.parse(raw)
}

/**
 * Find active stream buffer for a tab
 * Returns the most recent requestId if found
 */
export async function findStreamBufferByTab(tabKey: string): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null // Standalone mode

  const lookupKey = `${BUFFER_KEY_PREFIX}tab:${tabKey}`

  return redis.get(lookupKey)
}

/**
 * Lua script for atomic cursor read and update
 * Prevents race conditions when multiple clients reconnect simultaneously
 *
 * ARGV[1]: userId for verification
 * ARGV[2]: afterSeq (optional, can be -1)
 * Returns: JSON string with {messages, state, error, lastReadSeq, unauthorized} or nil if not found
 */
const GET_UNREAD_SCRIPT = `
local entry = redis.call('GET', KEYS[1])
if not entry then return nil end

local data = cjson.decode(entry)

-- Security: verify user owns this buffer
if data.userId ~= ARGV[1] then
  return cjson.encode({unauthorized = true})
end

-- Initialize cursor for legacy buffers
if not data.lastReadSeq then
  data.lastReadSeq = data.lastReadIndex or 0
end

-- Optional: advance cursor from client-provided afterSeq
local afterSeq = tonumber(ARGV[2])
local advanced = false
if afterSeq and afterSeq > data.lastReadSeq then
  data.lastReadSeq = afterSeq
  advanced = true
end

-- Get unread messages by seq (supports legacy string arrays)
local unreadMessages = {}
local lastReturned = data.lastReadSeq
for i = 1, #data.messages do
  local msg = data.messages[i]
  local seq = 0
  local line = nil
  if type(msg) == 'table' then
    seq = tonumber(msg.seq) or 0
    line = msg.line
  else
    seq = i
    line = msg
  end

  if seq > data.lastReadSeq then
    table.insert(unreadMessages, line)
    if seq > lastReturned then
      lastReturned = seq
    end
  end
end

-- Persist cursor if advanced or messages read
if advanced or #unreadMessages > 0 then
  if lastReturned > data.lastReadSeq then
    data.lastReadSeq = lastReturned
  end
  local ttl = redis.call('TTL', KEYS[1])
  if ttl > 0 then
    redis.call('SETEX', KEYS[1], ttl, cjson.encode(data))
  end
end

return cjson.encode({
  messages = unreadMessages,
  state = data.state,
  error = data.error,
  lastReadSeq = data.lastReadSeq
})
`

/**
 * Get unread messages from buffer (cursor-based, atomic operation)
 * Returns messages after lastReadSeq and updates the cursor
 *
 * Uses Lua script to prevent race conditions in concurrent reconnections
 */
export async function getUnreadMessages(
  requestId: string,
  userId: string,
  afterSeq?: number,
): Promise<{ messages: string[]; state: StreamBufferEntry["state"]; error?: string; lastReadSeq: number } | null> {
  const redis = getRedis()
  if (!redis) return null // Standalone mode

  const key = `${BUFFER_KEY_PREFIX}${requestId}`

  const result = await redis.eval(
    GET_UNREAD_SCRIPT,
    1,
    key,
    userId,
    typeof afterSeq === "number" ? afterSeq.toString() : "-1",
  )

  if (!result) return null

  const parsed = JSON.parse(result as string)

  // Security: user verification failed
  if (parsed.unauthorized) {
    console.warn(`[StreamBuffer] User ${userId} attempted to access buffer owned by another user`)
    return null
  }

  return {
    messages: parsed.messages || [],
    state: parsed.state,
    error: parsed.error,
    lastReadSeq: parsed.lastReadSeq ?? 0,
  }
}

/**
 * Acknowledge a stream cursor without fetching messages
 */
const ACK_SCRIPT = `
local entry = redis.call('GET', KEYS[1])
if not entry then return nil end

local data = cjson.decode(entry)

-- Security: verify user owns this buffer
if data.userId ~= ARGV[1] then
  return cjson.encode({unauthorized = true})
end

-- Initialize cursor for legacy buffers
if not data.lastReadSeq then
  data.lastReadSeq = data.lastReadIndex or 0
end

local seq = tonumber(ARGV[2])
if seq and seq > data.lastReadSeq then
  data.lastReadSeq = seq
  local ttl = redis.call('TTL', KEYS[1])
  if ttl > 0 then
    redis.call('SETEX', KEYS[1], ttl, cjson.encode(data))
  end
end

return cjson.encode({
  lastReadSeq = data.lastReadSeq
})
`

export async function ackStreamCursor(
  requestId: string,
  userId: string,
  lastSeenSeq: number,
): Promise<{ lastReadSeq: number } | null> {
  const redis = getRedis()
  if (!redis) return null
  const key = `${BUFFER_KEY_PREFIX}${requestId}`

  const result = await redis.eval(ACK_SCRIPT, 1, key, userId, lastSeenSeq.toString())
  if (!result) return null

  const parsed = JSON.parse(result as string)
  if (parsed.unauthorized) {
    console.warn(`[StreamBuffer] User ${userId} attempted to ack buffer owned by another user`)
    return null
  }

  return { lastReadSeq: parsed.lastReadSeq ?? 0 }
}

/**
 * Delete stream buffer (cleanup after client confirms receipt)
 */
export async function deleteStreamBuffer(requestId: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return // Standalone mode

  const key = `${BUFFER_KEY_PREFIX}${requestId}`

  // Get tab key before deletion for lookup cleanup
  const raw = await redis.get(key)
  if (raw) {
    const entry: StreamBufferEntry = JSON.parse(raw)
    const lookupKey = `${BUFFER_KEY_PREFIX}tab:${entry.tabKey}`
    await redis.del(lookupKey)
  }

  await redis.del(key)
}

/**
 * Check if there's an active/recent stream for this tab
 * Used to provide better UX on reconnection
 *
 * A stream is considered stale if:
 * - State is "streaming" but no message received in 5 minutes
 * This prevents showing "thinking" forever if stream died unexpectedly
 */
export async function hasActiveStream(
  tabKey: string,
): Promise<{ hasStream: boolean; state?: StreamBufferEntry["state"]; requestId?: string }> {
  const requestId = await findStreamBufferByTab(tabKey)
  if (!requestId) {
    return { hasStream: false }
  }

  const buffer = await getStreamBuffer(requestId)
  if (!buffer) {
    return { hasStream: false }
  }

  // Check for stale stream: if streaming but no activity in 5 minutes, treat as complete
  if (buffer.state === "streaming") {
    const lastActivity = buffer.lastMessageAt || buffer.startedAt
    const timeSinceLastActivity = Date.now() - lastActivity
    if (timeSinceLastActivity > STALE_STREAM_THRESHOLD_MS) {
      console.log(
        `[StreamBuffer] Stream ${requestId} is stale (no activity for ${Math.round(timeSinceLastActivity / 1000)}s), marking as complete`,
      )
      // Mark as complete so client doesn't wait forever
      await completeStreamBuffer(requestId)
      return {
        hasStream: true,
        state: "complete",
        requestId,
      }
    }
  }

  return {
    hasStream: true,
    state: buffer.state,
    requestId,
  }
}
