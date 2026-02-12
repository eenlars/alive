/**
 * @webalive/worker-pool
 *
 * Persistent worker pool for Claude Agent SDK with Unix socket IPC.
 *
 * @example
 * ```typescript
 * import { getWorkerPool } from '@webalive/worker-pool'
 *
 * const pool = getWorkerPool()
 *
 * const result = await pool.query(
 *   { uid: 1001, gid: 1001, cwd: '/srv/sites/example', workspaceKey: 'example.com' },
 *   {
 *     requestId: 'req-123',
 *     payload: { message: 'Hello Claude!' },
 *     onMessage: (msg) => console.log(msg),
 *   }
 * )
 * ```
 */

export { createConfig, DEFAULT_CONFIG, getSocketPath } from "./config.js"
// IPC utilities
export {
  createIpcClient,
  createIpcServer,
  type IpcClient,
  type IpcClientOptions,
  type IpcServer,
  type IpcServerOptions,
  isParentMessage,
  isWorkerMessage,
  NdjsonParser,
} from "./ipc.js"
// Core exports
export { getWorkerPool, resetWorkerPool, WorkerPoolLimitError, WorkerPoolManager } from "./manager.js"

// Types
export type {
  // Agent
  AgentConfig,
  AgentRequest,
  CompleteResult,
  EnvVarName,
  EvictionStrategy,
  ParentMessageType,
  // IPC Protocol
  ParentToWorkerMessage,
  QueryOptions,
  QueryResult,
  // Stream
  StreamType,
  WorkerHandle,
  WorkerInfo,
  WorkerMcpServerStatus,
  WorkerMcpStatusSummary,
  WorkerMessageType,
  // Pool
  WorkerPoolConfig,
  WorkerPoolEventListener,
  // Events
  WorkerPoolEvents,
  WorkerQueryFailureDiagnostics,
  // Worker
  WorkerState,
  WorkerToParentMessage,
  WorkspaceCredentials,
} from "./types.js"
// Constants
// Type Guards
export {
  ENV_VARS,
  EVICTION_STRATEGIES,
  filterMessagesByType,
  findMessageByType,
  isCancelMessage,
  isCompleteMessage,
  isCompleteResult,
  isErrorMessage,
  isHealthOkMessage,
  isMessageEvent,
  isQueryMessage,
  isQueryResultCancelled,
  isReadyMessage,
  isSessionMessage,
  isShutdownMessage,
  PARENT_MESSAGE_TYPES,
  STREAM_TYPES,
  WORKER_MESSAGE_TYPES,
  WORKER_STATES,
} from "./types.js"
