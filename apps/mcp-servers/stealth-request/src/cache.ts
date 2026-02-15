import { createHash } from "node:crypto"

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

const SWEEP_INTERVAL_MS = 60_000

export class RequestCache<T> {
  private store = new Map<string, CacheEntry<T>>()
  private sweepTimer: ReturnType<typeof setInterval>

  constructor() {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
    this.sweepTimer.unref()
  }

  static buildKey(url: string, method: string, body?: unknown): string {
    const raw = JSON.stringify({ url, method, body: body ?? null })
    return createHash("sha256").update(raw).digest("hex")
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.data
  }

  set(key: string, data: T, ttlSeconds: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
  }

  private sweep(): void {
    const now = Date.now()
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key)
      }
    }
  }
}
