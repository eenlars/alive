/**
 * Stream Buffer Tests
 *
 * Tests the Lua script for unread message retrieval.
 * Verifies cursor-based replay in the GET_UNREAD_SCRIPT.
 *
 * NOTE: These tests require Redis and are skipped in CI.
 */

import { createRedisClient } from "@webalive/redis"
import { getRedisUrl } from "@webalive/env/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

// Skip these tests in CI (no Redis available)
const isCI = process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true"

describe.skipIf(isCI)("Stream Buffer - Lua Script (GET_UNREAD_SCRIPT)", () => {
  let redis: ReturnType<typeof createRedisClient>

  beforeAll(() => {
    redis = createRedisClient(getRedisUrl())
  }, 15000)

  afterAll(async () => {
    await redis.quit()
  }, 15000)

  it("correctly retrieves unread messages on first read", async () => {
    // Lua script for testing (same as in stream-buffer.ts)
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

-- Update cursor atomically if there are unread messages
if #unreadMessages > 0 then
  data.lastReadSeq = lastReturned
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

    const testKey = `test:stream-buffer:${Date.now()}`
    const userId = "test-user-123"

    // Create initial buffer entry with 3 messages
    const initialEntry = {
      requestId: "req-123",
      tabKey: "tab-123",
      userId,
      state: "streaming",
      messages: [
        { seq: 1, line: "msg1" },
        { seq: 2, line: "msg2" },
        { seq: 3, line: "msg3" },
      ],
      startedAt: Date.now(),
      lastMessageAt: Date.now(),
      lastReadSeq: 0, // Initial state
    }

    await redis.setex(testKey, 3600, JSON.stringify(initialEntry))

    // First read: should get all 3 messages
    const result1 = await redis.eval(GET_UNREAD_SCRIPT, 1, testKey, userId)
    const parsed1 = JSON.parse(result1 as string)

    expect(parsed1.messages).toEqual(["msg1", "msg2", "msg3"])
    expect(parsed1.state).toBe("streaming")

    // Verify cursor was updated to last seq read
    const buffer1 = await redis.get(testKey)
    const data1 = JSON.parse(buffer1 || "{}")
    expect(data1.lastReadSeq).toBe(3)

    // Second read: should get no messages (already read all)
    const result2 = await redis.eval(GET_UNREAD_SCRIPT, 1, testKey, userId)
    const parsed2 = JSON.parse(result2 as string)

    // Note: cjson encodes empty tables as {} (object) not [] (array)
    // Normalize: empty object or empty array both mean "no messages"
    const messages2 = Array.isArray(parsed2.messages) ? parsed2.messages : []
    expect(messages2).toEqual([])
    expect(parsed2.state).toBe("streaming")

    // Add a new message
    const buffer2 = await redis.get(testKey)
    const data2 = JSON.parse(buffer2 || "{}")
    data2.messages.push({ seq: 4, line: "msg4" })
    data2.lastMessageAt = Date.now()
    await redis.setex(testKey, 3600, JSON.stringify(data2))

    // Third read: should get only the new message
    const result3 = await redis.eval(GET_UNREAD_SCRIPT, 1, testKey, userId)
    const parsed3 = JSON.parse(result3 as string)

    expect(parsed3.messages).toEqual(["msg4"])

    // Verify cursor was updated to seq of msg4
    const buffer3 = await redis.get(testKey)
    const data3 = JSON.parse(buffer3 || "{}")
    expect(data3.lastReadSeq).toBe(4)

    // Cleanup
    await redis.del(testKey)
  })

  it("rejects unauthorized access", async () => {
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

if #unreadMessages > 0 then
  data.lastReadSeq = lastReturned
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

    const testKey = `test:stream-buffer:${Date.now()}`
    const userId = "user-123"
    const wrongUserId = "user-456"

    // Create buffer owned by user-123
    const entry = {
      requestId: "req-123",
      tabKey: "tab-123",
      userId,
      state: "streaming",
      messages: [{ seq: 1, line: "msg1" }],
      startedAt: Date.now(),
      lastMessageAt: Date.now(),
      lastReadSeq: 0,
    }

    await redis.setex(testKey, 3600, JSON.stringify(entry))

    // Try to read as different user
    const result = await redis.eval(GET_UNREAD_SCRIPT, 1, testKey, wrongUserId)
    const parsed = JSON.parse(result as string)

    expect(parsed.unauthorized).toBe(true)

    // Cleanup
    await redis.del(testKey)
  })
})
