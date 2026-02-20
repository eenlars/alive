import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Browser, BrowserContext, Page } from "puppeteer"
import puppeteerExtra from "puppeteer-extra"
import stealthPlugin from "puppeteer-extra-plugin-stealth"
import { USER_AGENTS } from "./constants"

// Register stealth plugin globally (singleton — safe to call once)
puppeteerExtra.use(stealthPlugin())

const POOL_SIZE = 3
const MAX_USES_PER_BROWSER = 50

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
  "--disable-infobars",
  "--window-size=1920,1080",
  "--disable-dev-shm-usage",
]

interface BrowserSlot {
  browser: Browser
  userDataDir: string
  uses: number
  busy: boolean
}

export interface PooledPage {
  page: Page
  context: BrowserContext
  release: () => Promise<void>
}

export interface PoolStats {
  total: number
  busy: number
  idle: number
  waiters: number
}

class BrowserPool {
  private slots: (BrowserSlot | null)[]
  private waitQueue: Array<{ resolve: (slotIndex: number) => void; reject: (err: Error) => void }> = []
  private reservedSlots = new Set<number>()
  private shuttingDown = false
  private size: number
  private maxUses: number

  constructor(size: number = POOL_SIZE, maxUses: number = MAX_USES_PER_BROWSER) {
    this.size = size
    this.maxUses = maxUses
    this.slots = new Array(size).fill(null)
  }

  private async launchBrowser(extraArgs?: string[]): Promise<{ browser: Browser; userDataDir: string }> {
    const userDataDir = mkdtempSync(join(tmpdir(), "puppeteer_dev_profile-"))
    const args = extraArgs ? [...LAUNCH_ARGS, ...extraArgs] : LAUNCH_ARGS
    const browser = await puppeteerExtra.launch({
      headless: true,
      args,
      userDataDir,
    })
    console.log(`[pool] Launched browser (dir: ${userDataDir})`)
    return { browser, userDataDir }
  }

  private async destroySlot(index: number): Promise<void> {
    const slot = this.slots[index]
    if (!slot) return
    try {
      const pages = await slot.browser.pages()
      await Promise.allSettled(pages.map(p => p.close()))
      await slot.browser.close()
    } catch {}
    try {
      if (existsSync(slot.userDataDir)) {
        rmSync(slot.userDataDir, { recursive: true, force: true })
      }
    } catch {}
    this.slots[index] = null
  }

  private findFreeSlot(): number {
    // Prefer existing non-busy slot (reuse), then empty slot (needs launch)
    // Skip reserved slots (being recycled by another acquire)
    let emptySlot = -1
    for (let i = 0; i < this.slots.length; i++) {
      if (this.reservedSlots.has(i)) continue
      const slot = this.slots[i]
      if (slot && !slot.busy) return i
      if (!slot && emptySlot === -1) emptySlot = i
    }
    return emptySlot // -1 if all slots occupied and busy
  }

  async acquire(): Promise<PooledPage> {
    if (this.shuttingDown) {
      throw new Error("Pool is shutting down")
    }

    let slotIndex = this.findFreeSlot()
    if (slotIndex === -1) {
      slotIndex = await new Promise<number>((resolve, reject) => {
        this.waitQueue.push({ resolve, reject })
      })
    }

    let slot = this.slots[slotIndex]

    // Need new browser? (empty slot, crashed, or exhausted)
    if (!slot || !slot.browser.isConnected() || slot.uses >= this.maxUses) {
      if (slot) {
        console.log(`[pool] Recycling slot ${slotIndex} (uses: ${slot.uses}, connected: ${slot.browser.isConnected()})`)
      }
      // Reserve the slot to prevent concurrent acquire() from claiming it during async recycling
      this.reservedSlots.add(slotIndex)
      try {
        await this.destroySlot(slotIndex)
        const { browser, userDataDir } = await this.launchBrowser()
        slot = { browser, userDataDir, uses: 0, busy: false }
        this.slots[slotIndex] = slot
      } catch (launchErr) {
        // Slot is null (destroyed); unblock the next waiter so they aren't stranded
        const next = this.waitQueue.shift()
        if (next) next.reject(launchErr instanceof Error ? launchErr : new Error(String(launchErr)))
        throw launchErr
      } finally {
        this.reservedSlots.delete(slotIndex)
      }
    }

    slot.busy = true
    slot.uses++

    try {
      // Isolated context per request — full cookie/storage separation
      const context = await slot.browser.createBrowserContext()
      const page = await context.newPage()

      // Random user agent per page
      const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)] ?? USER_AGENTS[0]!
      await page.setUserAgent(ua)

      const idx = slotIndex
      return {
        page,
        context,
        release: async () => {
          try {
            await context.close()
          } catch {}
          const s = this.slots[idx]
          if (s) s.busy = false
          const next = this.waitQueue.shift()
          if (next) next.resolve(idx)
        },
      }
    } catch (err) {
      slot.busy = false
      const next = this.waitQueue.shift()
      if (next) next.resolve(slotIndex)
      throw err
    }
  }

  /** Launch a one-off browser for proxy requests (not pooled) */
  async launchOneOff(extraArgs?: string[]): Promise<{ browser: Browser; userDataDir: string }> {
    return this.launchBrowser(extraArgs)
  }

  /** Pre-launch all browsers for fast first requests */
  async warmup(): Promise<void> {
    const promises: Promise<void>[] = []
    for (let i = 0; i < this.size; i++) {
      if (!this.slots[i]) {
        const idx = i
        this.reservedSlots.add(idx)
        promises.push(
          (async () => {
            try {
              const { browser, userDataDir } = await this.launchBrowser()
              this.slots[idx] = { browser, userDataDir, uses: 0, busy: false }
            } finally {
              this.reservedSlots.delete(idx)
            }
          })(),
        )
      }
    }
    await Promise.all(promises)
    console.log(`[pool] Warmed up ${this.size} browsers`)
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true
    // Reject all waiters so pending acquire() calls throw instead of leaking browsers
    const shutdownError = new Error("Pool is shutting down")
    for (const { reject } of this.waitQueue) {
      reject(shutdownError)
    }
    this.waitQueue = []
    for (let i = 0; i < this.slots.length; i++) {
      await this.destroySlot(i)
    }
    console.log("[pool] All browsers shut down")
  }

  get stats(): PoolStats {
    let busy = 0
    let idle = 0
    for (const slot of this.slots) {
      if (slot?.busy) busy++
      else if (slot) idle++
    }
    return {
      total: this.slots.filter(Boolean).length,
      busy,
      idle,
      waiters: this.waitQueue.length,
    }
  }
}

export const browserPool = new BrowserPool()
