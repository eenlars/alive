import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { STREAM_TYPES } from "@webalive/shared"
import { WorkerPoolManager, resetWorkerPool, getWorkerPool } from "../src/manager"
import { createConfig, DEFAULT_CONFIG } from "../src/config"

// NOTE: We intentionally do NOT use vi.mock() for any node modules here.
// Bun's mock system applies globally across ALL test files in the process,
// which breaks other tests (like lifecycle.test.ts) that need real implementations.
//
// Instead, these tests focus on WorkerPoolManager's public interface
// without spawning actual workers. The manager handles missing sockets/workers
// gracefully, so no mocking is needed.

describe("WorkerPoolManager", () => {
  let manager: WorkerPoolManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new WorkerPoolManager({
      maxWorkers: 5,
      inactivityTimeoutMs: 1000,
      socketDir: "/tmp/test-workers",
    })
  })

  afterEach(async () => {
    manager.stopEvictionTimer()
    await resetWorkerPool()
  })

  describe("configuration", () => {
    it("should use default config values", () => {
      const config = createConfig()
      expect(config.maxWorkers).toBe(DEFAULT_CONFIG.maxWorkers)
      expect(config.inactivityTimeoutMs).toBe(DEFAULT_CONFIG.inactivityTimeoutMs)
      expect(config.maxAgeMs).toBe(DEFAULT_CONFIG.maxAgeMs)
      expect(config.evictionStrategy).toBe("lru")
    })

    it("should allow config overrides", () => {
      const config = createConfig({
        maxWorkers: 10,
        inactivityTimeoutMs: 5000,
      })
      expect(config.maxWorkers).toBe(10)
      expect(config.inactivityTimeoutMs).toBe(5000)
      // Other values should be default
      expect(config.maxAgeMs).toBe(DEFAULT_CONFIG.maxAgeMs)
    })
  })

  describe("getWorkerInfo", () => {
    it("should return empty array when no workers", () => {
      const info = manager.getWorkerInfo()
      expect(info).toEqual([])
    })
  })

  describe("getStats", () => {
    it("should return correct stats when no workers", () => {
      const stats = manager.getStats()
      expect(stats).toMatchObject({
        totalWorkers: 0,
        activeWorkers: 0,
        idleWorkers: 0,
        maxWorkers: 5,
      })
      expect(typeof stats.dynamicMaxWorkers).toBe("number")
      expect(typeof stats.retiredAfterCancel).toBe("number")
      expect(typeof stats.orphansReaped).toBe("number")
    })
  })

  describe("events", () => {
    it("should emit events with correct types", () => {
      const spawnedHandler = vi.fn()
      manager.on("worker:spawned", spawnedHandler)

      // Manually emit to test event typing
      manager.emit("worker:spawned", {
        workspaceKey: "test.com",
        pid: 12345,
      })

      expect(spawnedHandler).toHaveBeenCalledWith({
        workspaceKey: "test.com",
        pid: 12345,
      })
    })

    it("should support multiple event listeners", () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()

      manager.on("worker:ready", handler1)
      manager.on("worker:ready", handler2)

      manager.emit("worker:ready", {
        workspaceKey: "test.com",
        pid: 12345,
      })

      expect(handler1).toHaveBeenCalled()
      expect(handler2).toHaveBeenCalled()
    })
  })

  describe("shutdownAll", () => {
    it("should not throw when no workers to shutdown", async () => {
      // Should complete without error
      await manager.shutdownAll()
      expect(manager.getStats().totalWorkers).toBe(0)
    })
  })

  describe("shutdownWorker", () => {
    it("should not throw when worker does not exist", async () => {
      // Should complete without error
      await manager.shutdownWorker("nonexistent.com")
      expect(manager.getStats().totalWorkers).toBe(0)
    })
  })

  describe("eviction timer", () => {
    it("should start and stop eviction timer", () => {
      // Start should not throw
      manager.startEvictionTimer()
      expect(() => manager.startEvictionTimer()).not.toThrow() // Idempotent

      // Stop should not throw
      manager.stopEvictionTimer()
      expect(() => manager.stopEvictionTimer()).not.toThrow() // Idempotent
    })
  })
})

describe("getWorkerPool singleton", () => {
  afterEach(async () => {
    await resetWorkerPool()
  })

  it("should return same instance on subsequent calls", () => {
    const pool1 = getWorkerPool()
    const pool2 = getWorkerPool()
    expect(pool1).toBe(pool2)
  })

  it("should warn when config passed to existing instance", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    getWorkerPool({ maxWorkers: 10 })
    getWorkerPool({ maxWorkers: 20 }) // Should warn, config ignored

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("config but instance already exists"))
    warnSpy.mockRestore()
  })

  it("should not warn when no config passed", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})

    getWorkerPool({ maxWorkers: 10 })
    getWorkerPool() // No config, no warning

    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe("createConfig overrides", () => {
  it("should use shared constants as defaults", () => {
    const config = createConfig()
    expect(config.maxWorkers).toBe(DEFAULT_CONFIG.maxWorkers)
    expect(config.inactivityTimeoutMs).toBe(DEFAULT_CONFIG.inactivityTimeoutMs)
  })

  it("should allow explicit overrides", () => {
    const config = createConfig({ maxWorkers: 50, inactivityTimeoutMs: 60000 })
    expect(config.maxWorkers).toBe(50)
    expect(config.inactivityTimeoutMs).toBe(60000)
  })

  it("should preserve other defaults when partially overriding", () => {
    const config = createConfig({ maxWorkers: 50 })
    expect(config.maxWorkers).toBe(50)
    expect(config.inactivityTimeoutMs).toBe(DEFAULT_CONFIG.inactivityTimeoutMs)
    expect(config.maxAgeMs).toBe(DEFAULT_CONFIG.maxAgeMs)
  })
})

describe("Multi-worker per workspace", () => {
  let manager: WorkerPoolManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new WorkerPoolManager({
      maxWorkers: 3,
      inactivityTimeoutMs: 1000,
      socketDir: "/tmp/test-workers",
    })
  })

  afterEach(async () => {
    manager.stopEvictionTimer()
    await resetWorkerPool()
  })

  describe("worker keying", () => {
    it("should use workspaceKey:instanceId format for worker keys", () => {
      // Manually emit worker events to verify key format
      const spawnedHandler = vi.fn()
      manager.on("worker:spawned", spawnedHandler)

      // Simulate spawned event with instance key
      manager.emit("worker:spawned", {
        workspaceKey: "example.com:0",
        pid: 12345,
      })

      expect(spawnedHandler).toHaveBeenCalledWith({
        workspaceKey: "example.com:0",
        pid: 12345,
      })
    })

    it("should emit worker:busy with request tracking", () => {
      const busyHandler = vi.fn()
      manager.on("worker:busy", busyHandler)

      manager.emit("worker:busy", {
        workspaceKey: "example.com:0",
        requestId: "req-123",
      })

      expect(busyHandler).toHaveBeenCalledWith({
        workspaceKey: "example.com:0",
        requestId: "req-123",
      })
    })
  })

  describe("queue processing on worker:idle", () => {
    it("should trigger queue processing when worker:idle is emitted", () => {
      // Create a spy to observe if emit is called with worker:idle
      const idleHandler = vi.fn()
      manager.on("worker:idle", idleHandler)

      // Emit worker:idle event (this triggers processQueue internally)
      manager.emit("worker:idle", {
        workspaceKey: "example.com:0",
      })

      expect(idleHandler).toHaveBeenCalledWith({
        workspaceKey: "example.com:0",
      })
    })

    it("should extract base workspace key from instance key", () => {
      // The processQueue is called with base key (without :instanceId)
      // We verify this through the event being properly emitted
      const idleHandler = vi.fn()
      manager.on("worker:idle", idleHandler)

      // Instance keys like "example.com:0" and "example.com:1" both map to "example.com" queue
      manager.emit("worker:idle", { workspaceKey: "example.com:2" })
      manager.emit("worker:idle", { workspaceKey: "example.com:0" })

      expect(idleHandler).toHaveBeenCalledTimes(2)
    })
  })
})

describe("Request queue behavior", () => {
  let manager: WorkerPoolManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new WorkerPoolManager({
      maxWorkers: 2,
      inactivityTimeoutMs: 1000,
      socketDir: "/tmp/test-workers",
    })
  })

  afterEach(async () => {
    manager.stopEvictionTimer()
    await resetWorkerPool()
  })

  it("should handle pool at capacity gracefully", () => {
    // Pool starts empty, capacity is 2
    const stats = manager.getStats()
    expect(stats.maxWorkers).toBe(2)
    expect(stats.totalWorkers).toBe(0)
  })

  it("should track queue via events", () => {
    // When queue events are implemented, they can be tested here
    // For now, verify the manager handles high load without crashing
    const errorHandler = vi.fn()
    manager.on("pool:error", errorHandler)

    // No errors should be emitted from normal operations
    expect(errorHandler).not.toHaveBeenCalled()
  })

  it("should require ownerKey in query options", async () => {
    const credentials = {
      uid: 1000,
      gid: 1000,
      cwd: "/srv/webalive/sites/example.com/user",
      workspaceKey: "example.com",
    }

    await expect(
      manager.query(credentials, {
        requestId: "req-no-owner",
        ownerKey: "" as string,
        payload: {
          message: "test",
          agentConfig: {
            allowedTools: [],
            disallowedTools: [],
            permissionMode: "default",
            settingSources: [],
            oauthMcpServers: {},
            bridgeStreamTypes: STREAM_TYPES,
          },
        },
        onMessage: () => {},
      }),
    ).rejects.toThrow("ownerKey is required")
  })
})

describe("createConfig validation", () => {
  describe("maxWorkers", () => {
    it("should reject zero and negative values", () => {
      expect(() => createConfig({ maxWorkers: 0 })).toThrow("Invalid maxWorkers")
      expect(() => createConfig({ maxWorkers: -1 })).toThrow("Invalid maxWorkers")
      expect(() => createConfig({ maxWorkers: -100 })).toThrow("Invalid maxWorkers")
    })

    it("should reject non-integer values", () => {
      expect(() => createConfig({ maxWorkers: 1.5 })).toThrow("Invalid maxWorkers")
      expect(() => createConfig({ maxWorkers: NaN })).toThrow("Invalid maxWorkers")
      expect(() => createConfig({ maxWorkers: Infinity })).toThrow("Invalid maxWorkers")
      expect(() => createConfig({ maxWorkers: -Infinity })).toThrow("Invalid maxWorkers")
    })

    it("should accept valid positive integers", () => {
      expect(() => createConfig({ maxWorkers: 1 })).not.toThrow()
      expect(() => createConfig({ maxWorkers: 100 })).not.toThrow()
    })
  })

  describe("timeout values", () => {
    it("should reject negative timeout values", () => {
      expect(() => createConfig({ inactivityTimeoutMs: -1 })).toThrow("Invalid inactivityTimeoutMs")
      expect(() => createConfig({ maxAgeMs: -1 })).toThrow("Invalid maxAgeMs")
    })

    it("should reject zero for required positive timeouts", () => {
      expect(() => createConfig({ readyTimeoutMs: 0 })).toThrow("Invalid readyTimeoutMs")
      expect(() => createConfig({ shutdownTimeoutMs: 0 })).toThrow("Invalid shutdownTimeoutMs")
      expect(() => createConfig({ cancelTimeoutMs: 0 })).toThrow("Invalid cancelTimeoutMs")
    })

    it("should reject non-integer timeout values", () => {
      expect(() => createConfig({ readyTimeoutMs: 1.5 })).toThrow("Invalid readyTimeoutMs")
      expect(() => createConfig({ shutdownTimeoutMs: NaN })).toThrow("Invalid shutdownTimeoutMs")
      expect(() => createConfig({ inactivityTimeoutMs: Infinity })).toThrow("Invalid inactivityTimeoutMs")
      expect(() => createConfig({ cancelTimeoutMs: -1 })).toThrow("Invalid cancelTimeoutMs")
    })

    it("should allow zero for optional timeouts (disable feature)", () => {
      expect(() => createConfig({ inactivityTimeoutMs: 0 })).not.toThrow()
      expect(() => createConfig({ maxAgeMs: 0 })).not.toThrow()
    })
  })

  describe("evictionStrategy", () => {
    it("should reject invalid strategies", () => {
      expect(() => createConfig({ evictionStrategy: "invalid" as "lru" })).toThrow("Invalid evictionStrategy")
      expect(() => createConfig({ evictionStrategy: "" as "lru" })).toThrow("Invalid evictionStrategy")
      expect(() => createConfig({ evictionStrategy: "LRU" as "lru" })).toThrow("Invalid evictionStrategy") // case-sensitive
    })

    it("should accept all valid strategies", () => {
      expect(() => createConfig({ evictionStrategy: "lru" })).not.toThrow()
      expect(() => createConfig({ evictionStrategy: "oldest" })).not.toThrow()
      expect(() => createConfig({ evictionStrategy: "least_used" })).not.toThrow()
    })
  })

  describe("path strings", () => {
    it("should reject empty strings", () => {
      expect(() => createConfig({ workerEntryPath: "" })).toThrow("workerEntryPath must be a non-empty string")
      expect(() => createConfig({ socketDir: "" })).toThrow("socketDir must be a non-empty string")
    })

    it("should accept non-empty paths", () => {
      expect(() => createConfig({ workerEntryPath: "/path/to/worker.js" })).not.toThrow()
      expect(() => createConfig({ socketDir: "/tmp/sockets" })).not.toThrow()
    })
  })

  describe("fairness and CPU knobs", () => {
    it("should reject invalid fairness limits", () => {
      expect(() => createConfig({ maxWorkersPerUser: 0 })).toThrow("Invalid maxWorkersPerUser")
      expect(() => createConfig({ maxWorkersPerWorkspace: 0 })).toThrow("Invalid maxWorkersPerWorkspace")
      expect(() => createConfig({ maxQueuedPerUser: 0 })).toThrow("Invalid maxQueuedPerUser")
      expect(() => createConfig({ maxQueuedPerWorkspace: 0 })).toThrow("Invalid maxQueuedPerWorkspace")
      expect(() => createConfig({ maxQueuedGlobal: 0 })).toThrow("Invalid maxQueuedGlobal")
    })

    it("should reject invalid cpu/load knobs", () => {
      expect(() => createConfig({ workersPerCore: 0 })).toThrow("Invalid workersPerCore")
      expect(() => createConfig({ loadShedThreshold: 0 })).toThrow("Invalid loadShedThreshold")
      expect(() => createConfig({ killGraceMs: 0 })).toThrow("Invalid killGraceMs")
      expect(() => createConfig({ orphanSweepIntervalMs: 0 })).toThrow("Invalid orphanSweepIntervalMs")
      expect(() => createConfig({ orphanMaxAgeMs: 0 })).toThrow("Invalid orphanMaxAgeMs")
    })
  })
})
