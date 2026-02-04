/**
 * Worker Pool Types
 *
 * TypeScript interfaces for the persistent worker pool architecture.
 */

import type { ChildProcess } from "node:child_process"
import type { Socket } from "node:net"
import { STREAM_TYPES, type StreamType } from "@webalive/shared"

// Re-export for convenience (canonical source: @webalive/shared)
export { STREAM_TYPES, type StreamType }

// ============================================================================
// Constants (defined first so types can reference them)
// ============================================================================

/** Message types sent from worker to parent */
export const WORKER_MESSAGE_TYPES = {
  READY: "ready",
  SESSION: "session",
  MESSAGE: "message",
  COMPLETE: "complete",
  ERROR: "error",
  SHUTDOWN_ACK: "shutdown_ack",
  HEALTH_OK: "health_ok",
} as const

/** Message types sent from parent to worker */
export const PARENT_MESSAGE_TYPES = {
  QUERY: "query",
  CANCEL: "cancel",
  SHUTDOWN: "shutdown",
  HEALTH_CHECK: "health_check",
} as const

/** Worker lifecycle states */
export const WORKER_STATES = {
  STARTING: "starting",
  READY: "ready",
  BUSY: "busy",
  SHUTTING_DOWN: "shutting_down",
  DEAD: "dead",
} as const

/** Environment variables used by worker pool */
export const ENV_VARS = {
  /** Session cookie for MCP tool authentication */
  ALIVE_SESSION_COOKIE: "ALIVE_SESSION_COOKIE",
  /** Target UID for privilege dropping */
  TARGET_UID: "TARGET_UID",
  /** Target GID for privilege dropping */
  TARGET_GID: "TARGET_GID",
  /** Target working directory */
  TARGET_CWD: "TARGET_CWD",
  /** Unix socket path for IPC */
  WORKER_SOCKET_PATH: "WORKER_SOCKET_PATH",
  /** Workspace identifier */
  WORKER_WORKSPACE_KEY: "WORKER_WORKSPACE_KEY",
} as const

/** Eviction strategies for pool capacity management */
export const EVICTION_STRATEGIES = {
  LRU: "lru",
  OLDEST: "oldest",
  LEAST_USED: "least_used",
} as const

// ============================================================================
// Derived Types (from constants)
// ============================================================================

export type WorkerMessageType = (typeof WORKER_MESSAGE_TYPES)[keyof typeof WORKER_MESSAGE_TYPES]
export type ParentMessageType = (typeof PARENT_MESSAGE_TYPES)[keyof typeof PARENT_MESSAGE_TYPES]
export type WorkerState = (typeof WORKER_STATES)[keyof typeof WORKER_STATES]
export type EnvVarName = (typeof ENV_VARS)[keyof typeof ENV_VARS]
export type EvictionStrategy = (typeof EVICTION_STRATEGIES)[keyof typeof EVICTION_STRATEGIES]

// ============================================================================
// IPC Protocol Types (Parent <-> Worker)
// ============================================================================

/** Messages sent from parent to worker */
export type ParentToWorkerMessage =
  | { type: "query"; requestId: string; payload: AgentRequest }
  | { type: "cancel"; requestId: string }
  | { type: "shutdown"; graceful: boolean }
  | { type: "health_check" }

/** Result payload for complete message */
export interface CompleteResult {
  type: string
  totalMessages: number
  result: unknown
  /** True if the query was cancelled via abort signal */
  cancelled: boolean
}

/** Messages sent from worker to parent */
export type WorkerToParentMessage =
  | { type: "ready" }
  | { type: "session"; requestId: string; sessionId: string }
  | { type: "message"; requestId: string; content: unknown }
  | { type: "complete"; requestId: string; result: CompleteResult }
  | { type: "error"; requestId: string; error: string; stack?: string }
  | { type: "shutdown_ack" }
  | { type: "health_ok"; uptime: number; queriesProcessed: number }

// ============================================================================
// Agent Request Types
// ============================================================================

/** Agent configuration passed from parent to worker */
export interface AgentConfig {
  /** Tools allowed for this workspace */
  allowedTools: string[]
  /** Tools explicitly disallowed */
  disallowedTools: string[]
  /** Permission mode for Claude SDK */
  permissionMode: string
  /** Settings sources for Claude SDK */
  settingSources: string[]
  /**
   * OAuth MCP server configurations (HTTP-based, JSON-serializable).
   *
   * Internal MCP servers (alive-workspace, alive-tools) are NOT included here
   * because createSdkMcpServer returns function objects that cannot be serialized
   * via IPC. The worker imports and creates those locally from @webalive/tools.
   */
  oauthMcpServers: Record<string, unknown>
  /** Bridge stream type constants (from @webalive/shared) */
  streamTypes: typeof STREAM_TYPES
  /** Whether the user is an admin (enables Bash tools) */
  isAdmin?: boolean
}

/** Request payload for Claude Agent SDK query */
export interface AgentRequest {
  message: string
  model?: string
  maxTurns?: number
  systemPrompt?: string
  resume?: string
  /** Resume at a specific message UUID (for message deletion/editing) */
  resumeSessionAt?: string
  /** User's API key (if they have their own) */
  apiKey?: string
  oauthTokens?: Record<string, string | undefined>
  /**
   * User-defined environment keys (custom API keys stored in lockbox).
   * These are passed to MCP servers via process.env.
   * Keys are prefixed with USER_ to avoid conflicts.
   */
  userEnvKeys?: Record<string, string>
  /** Agent configuration - passed from parent, not imported in worker */
  agentConfig: AgentConfig
  /**
   * Session cookie for MCP tool authentication.
   * Required for tools like restart_dev_server that call back to Bridge API.
   * Worker sets process.env.ALIVE_SESSION_COOKIE from this value.
   */
  sessionCookie?: string
}

/** Workspace credentials for privilege dropping */
export interface WorkspaceCredentials {
  uid: number
  gid: number
  cwd: string
  workspaceKey: string
}

// ============================================================================
// Worker State Types
// ============================================================================

/** Internal worker handle with metadata */
export interface WorkerHandle {
  /** Child process reference */
  process: ChildProcess
  /** Unix socket for IPC */
  socket: Socket | null
  /** Current state */
  state: WorkerState
  /** Workspace this worker serves */
  workspaceKey: string
  /** Workspace credentials */
  credentials: WorkspaceCredentials
  /** When worker was spawned */
  createdAt: Date
  /** Last activity timestamp */
  lastActivity: Date
  /** Number of queries processed */
  queriesProcessed: number
  /** Current active request ID (if busy) */
  activeRequestId: string | null
  /** Path to Unix socket */
  socketPath: string
}

/** External worker info (safe to expose) */
export interface WorkerInfo {
  workspaceKey: string
  state: WorkerState
  createdAt: Date
  lastActivity: Date
  queriesProcessed: number
  isActive: boolean
}

// ============================================================================
// Pool Manager Types
// ============================================================================

/** Worker pool configuration */
export interface WorkerPoolConfig {
  /** Maximum number of workers to keep alive */
  maxWorkers: number
  /** Time in ms before idle worker is terminated */
  inactivityTimeoutMs: number
  /** Maximum age in ms before worker is forced to restart */
  maxAgeMs: number
  /** How to select workers for eviction when at capacity */
  evictionStrategy: EvictionStrategy
  /** Path to worker entry script */
  workerEntryPath: string
  /** Directory for Unix sockets */
  socketDir: string
  /** Timeout for worker to become ready (ms) */
  readyTimeoutMs: number
  /** Timeout for graceful shutdown (ms) */
  shutdownTimeoutMs: number
  /** Timeout for cancel to complete before forcing cleanup (ms) */
  cancelTimeoutMs: number
}

/** Options for sending a query to a worker */
export interface QueryOptions {
  /** Request ID for tracking */
  requestId: string
  /** Agent request payload */
  payload: AgentRequest
  /** Callback for streamed messages */
  onMessage: (message: WorkerToParentMessage) => void
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/** Result of a query operation */
export interface QueryResult {
  success: boolean
  sessionId?: string
  result?: unknown
  error?: string
  /** True if the query was cancelled */
  cancelled?: boolean
}

// ============================================================================
// Event Types
// ============================================================================

/** Events emitted by WorkerPoolManager */
export interface WorkerPoolEvents {
  "worker:spawned": { workspaceKey: string; pid: number }
  "worker:ready": { workspaceKey: string; pid: number }
  "worker:busy": { workspaceKey: string; requestId: string }
  "worker:idle": { workspaceKey: string }
  "worker:shutdown": { workspaceKey: string; reason: string }
  "worker:crashed": { workspaceKey: string; exitCode: number | null; signal: string | null }
  "worker:evicted": { workspaceKey: string; reason: string }
  "pool:at_capacity": { currentWorkers: number; maxWorkers: number }
  "pool:error": { error: Error; context?: string }
}

/** Event listener type */
export type WorkerPoolEventListener<K extends keyof WorkerPoolEvents> = (event: WorkerPoolEvents[K]) => void

// ============================================================================
// Type Guards
// ============================================================================

/** Check if value is a non-null object */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Type guard for CompleteResult */
export function isCompleteResult(value: unknown): value is CompleteResult {
  return (
    isObject(value) &&
    typeof value.type === "string" &&
    typeof value.totalMessages === "number" &&
    typeof value.cancelled === "boolean"
  )
}

/** Type guard for QueryResult with cancelled flag */
export function isQueryResultCancelled(result: QueryResult): result is QueryResult & { cancelled: true } {
  return result.success === true && (result as { cancelled?: boolean }).cancelled === true
}

/** Type guard for session message */
export function isSessionMessage(
  msg: WorkerToParentMessage,
): msg is Extract<WorkerToParentMessage, { type: "session" }> {
  return msg.type === WORKER_MESSAGE_TYPES.SESSION
}

/** Type guard for complete message */
export function isCompleteMessage(
  msg: WorkerToParentMessage,
): msg is Extract<WorkerToParentMessage, { type: "complete" }> {
  return msg.type === WORKER_MESSAGE_TYPES.COMPLETE
}

/** Type guard for error message */
export function isErrorMessage(msg: WorkerToParentMessage): msg is Extract<WorkerToParentMessage, { type: "error" }> {
  return msg.type === WORKER_MESSAGE_TYPES.ERROR
}

/** Type guard for message event */
export function isMessageEvent(msg: WorkerToParentMessage): msg is Extract<WorkerToParentMessage, { type: "message" }> {
  return msg.type === WORKER_MESSAGE_TYPES.MESSAGE
}

/** Type guard for ready message */
export function isReadyMessage(msg: WorkerToParentMessage): msg is Extract<WorkerToParentMessage, { type: "ready" }> {
  return msg.type === WORKER_MESSAGE_TYPES.READY
}

/** Type guard for health_ok message */
export function isHealthOkMessage(
  msg: WorkerToParentMessage,
): msg is Extract<WorkerToParentMessage, { type: "health_ok" }> {
  return msg.type === WORKER_MESSAGE_TYPES.HEALTH_OK
}

/** Type guard for cancel message */
export function isCancelMessage(msg: ParentToWorkerMessage): msg is Extract<ParentToWorkerMessage, { type: "cancel" }> {
  return msg.type === PARENT_MESSAGE_TYPES.CANCEL
}

/** Type guard for query message */
export function isQueryMessage(msg: ParentToWorkerMessage): msg is Extract<ParentToWorkerMessage, { type: "query" }> {
  return msg.type === PARENT_MESSAGE_TYPES.QUERY
}

/** Type guard for shutdown message */
export function isShutdownMessage(
  msg: ParentToWorkerMessage,
): msg is Extract<ParentToWorkerMessage, { type: "shutdown" }> {
  return msg.type === PARENT_MESSAGE_TYPES.SHUTDOWN
}

/**
 * Type-safe message extractor - finds first message of specified type
 * Returns undefined if not found
 */
export function findMessageByType<T extends WorkerToParentMessage["type"]>(
  messages: WorkerToParentMessage[],
  type: T,
): Extract<WorkerToParentMessage, { type: T }> | undefined {
  return messages.find((m): m is Extract<WorkerToParentMessage, { type: T }> => m.type === type)
}

/**
 * Type-safe message filter - returns all messages of specified type
 */
export function filterMessagesByType<T extends WorkerToParentMessage["type"]>(
  messages: WorkerToParentMessage[],
  type: T,
): Extract<WorkerToParentMessage, { type: T }>[] {
  return messages.filter((m): m is Extract<WorkerToParentMessage, { type: T }> => m.type === type)
}
