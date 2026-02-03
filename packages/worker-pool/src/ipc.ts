/**
 * IPC Utilities
 *
 * Unix domain socket communication with NDJSON protocol.
 */

import { createServer, createConnection, type Server, type Socket } from "node:net"
import { mkdir, unlink, access } from "node:fs/promises"
import { dirname } from "node:path"
import { EventEmitter } from "node:events"
import {
  WORKER_MESSAGE_TYPES,
  PARENT_MESSAGE_TYPES,
  type ParentToWorkerMessage,
  type WorkerToParentMessage,
} from "./types.js"

// ============================================================================
// Constants
// ============================================================================

/** Maximum buffer size for NDJSON parser (10 MB - prevents memory exhaustion) */
const MAX_BUFFER_SIZE = 10 * 1024 * 1024

// ============================================================================
// NDJSON Parser
// ============================================================================

/**
 * Parse newline-delimited JSON from a stream
 * Handles partial messages across chunks
 */
export class NdjsonParser extends EventEmitter {
  private buffer = ""
  private maxBufferSize: number

  constructor(maxBufferSize = MAX_BUFFER_SIZE) {
    super()
    this.maxBufferSize = maxBufferSize
  }

  /** Process incoming data chunk */
  write(chunk: Buffer | string): void {
    this.buffer += chunk.toString()

    // Prevent memory exhaustion from unbounded buffer growth
    if (this.buffer.length > this.maxBufferSize) {
      this.buffer = ""
      this.emit("error", new Error(`Buffer exceeded ${this.maxBufferSize} bytes`))
      return
    }

    let newlineIndex: number
    while ((newlineIndex = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim()
      this.buffer = this.buffer.slice(newlineIndex + 1)

      if (line.length === 0) continue

      try {
        const parsed = JSON.parse(line)
        this.emit("message", parsed)
      } catch {
        // Truncate line in error message to prevent log flooding
        this.emit("error", new Error(`Failed to parse NDJSON: ${line.slice(0, 200)}`))
      }
    }
  }

  /** Clear any remaining buffer */
  flush(): void {
    const remaining = this.buffer.trim()
    this.buffer = ""

    if (remaining.length > 0) {
      try {
        const parsed = JSON.parse(remaining)
        this.emit("message", parsed)
      } catch {
        // Emit error for unparseable content - don't silently ignore
        this.emit("error", new Error(`Unparseable content in buffer on flush: ${remaining.slice(0, 200)}`))
      }
    }
  }
}

// ============================================================================
// Unix Socket Server (for parent process)
// ============================================================================

export interface IpcServerOptions {
  socketPath: string
  /** Called for each parsed message. Receives unknown - caller must validate. */
  onMessage: (message: unknown) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

/** IPC server handle returned by createIpcServer */
export interface IpcServer {
  server: Server
  sendMessage: (msg: ParentToWorkerMessage) => void
  close: () => Promise<void>
}

/**
 * Create Unix socket server for receiving messages from worker
 */
export async function createIpcServer(options: IpcServerOptions): Promise<IpcServer> {
  const { socketPath, onMessage, onConnect, onDisconnect, onError } = options

  // Ensure socket directory exists
  await mkdir(dirname(socketPath), { recursive: true })

  // Remove stale socket file if it exists
  try {
    await access(socketPath)
    await unlink(socketPath)
  } catch {
    // Socket doesn't exist, which is fine
  }

  let clientSocket: Socket | null = null
  let parser: NdjsonParser | null = null

  const server = createServer(socket => {
    // Clean up previous connection if it exists (handles worker restart)
    if (clientSocket && !clientSocket.destroyed) {
      clientSocket.destroy()
    }
    if (parser) {
      parser.flush()
      parser.removeAllListeners()
    }

    // Set up new connection
    clientSocket = socket
    parser = new NdjsonParser()

    parser.on("message", onMessage)
    parser.on("error", err => onError?.(err))

    onConnect?.()

    socket.on("data", chunk => parser?.write(chunk))
    socket.on("close", () => {
      clientSocket = null
      parser?.flush()
      onDisconnect?.()
    })
    socket.on("error", err => onError?.(err))
  })

  return new Promise((resolve, reject) => {
    server.on("error", reject)
    server.listen(socketPath, () => {
      resolve({
        server,
        sendMessage: (msg: ParentToWorkerMessage) => {
          if (clientSocket && !clientSocket.destroyed) {
            clientSocket.write(`${JSON.stringify(msg)}\n`)
          }
        },
        close: async () => {
          if (clientSocket) {
            clientSocket.destroy()
          }
          if (parser) {
            parser.removeAllListeners()
          }
          server.close()
          try {
            await unlink(socketPath)
          } catch {
            // Ignore cleanup errors
          }
        },
      })
    })
  })
}

// ============================================================================
// Unix Socket Client (for worker process)
// ============================================================================

export interface IpcClientOptions {
  socketPath: string
  /** Called for each parsed message. Receives unknown - caller must validate. */
  onMessage: (message: unknown) => void
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: Error) => void
}

/** IPC client handle returned by createIpcClient */
export interface IpcClient {
  socket: Socket
  sendMessage: (msg: WorkerToParentMessage) => void
  close: () => void
}

/**
 * Connect to Unix socket server in parent process
 */
export function createIpcClient(options: IpcClientOptions): Promise<IpcClient> {
  const { socketPath, onMessage, onConnect, onDisconnect, onError } = options

  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath)
    const parser = new NdjsonParser()

    parser.on("message", onMessage)
    parser.on("error", err => onError?.(err))

    socket.on("connect", () => {
      onConnect?.()
      resolve({
        socket,
        sendMessage: (msg: WorkerToParentMessage) => {
          if (!socket.destroyed) {
            socket.write(`${JSON.stringify(msg)}\n`)
          }
        },
        close: () => {
          parser.flush()
          socket.destroy()
        },
      })
    })

    socket.on("data", chunk => parser.write(chunk))
    socket.on("close", () => {
      parser.flush()
      onDisconnect?.()
    })
    socket.on("error", err => {
      onError?.(err)
      reject(err)
    })
  })
}

// ============================================================================
// Message Helpers
// ============================================================================

/** Valid worker message types (derived from constants) */
const VALID_WORKER_TYPES: Set<string> = new Set(Object.values(WORKER_MESSAGE_TYPES))

/** Valid parent message types (derived from constants) */
const VALID_PARENT_TYPES: Set<string> = new Set(Object.values(PARENT_MESSAGE_TYPES))

/** Helper to safely check if object has a type property */
function hasType(msg: unknown): msg is { type: unknown } {
  return typeof msg === "object" && msg !== null && "type" in msg
}

/** Type guard for WorkerToParentMessage */
export function isWorkerMessage(msg: unknown): msg is WorkerToParentMessage {
  return hasType(msg) && VALID_WORKER_TYPES.has(msg.type as string)
}

/** Type guard for ParentToWorkerMessage */
export function isParentMessage(msg: unknown): msg is ParentToWorkerMessage {
  return hasType(msg) && VALID_PARENT_TYPES.has(msg.type as string)
}
