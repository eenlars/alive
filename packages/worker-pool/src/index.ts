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

// Core exports
export { WorkerPoolManager, WorkerPoolLimitError, getWorkerPool, resetWorkerPool } from "./manager.js"
export { createConfig, getSocketPath, DEFAULT_CONFIG } from "./config.js"

// IPC utilities
export {
  createIpcServer,
  createIpcClient,
  NdjsonParser,
  isWorkerMessage,
  isParentMessage,
  type IpcServer,
  type IpcClient,
  type IpcServerOptions,
  type IpcClientOptions,
} from "./ipc.js"

// Types
export type {
  // IPC Protocol
  ParentToWorkerMessage,
  WorkerToParentMessage,
  CompleteResult,
  // Agent
  AgentConfig,
  AgentRequest,
  WorkspaceCredentials,
  // Worker
  WorkerState,
  WorkerHandle,
  WorkerInfo,
  // Pool
  WorkerPoolConfig,
  QueryOptions,
  QueryResult,
  // Events
  WorkerPoolEvents,
  WorkerPoolEventListener,
  // Stream
  StreamType,
  WorkerMessageType,
  ParentMessageType,
  EnvVarName,
  EvictionStrategy,
} from "./types.js"

// Constants
export {
  STREAM_TYPES,
  WORKER_MESSAGE_TYPES,
  PARENT_MESSAGE_TYPES,
  WORKER_STATES,
  ENV_VARS,
  EVICTION_STRATEGIES,
} from "./types.js"

// Type Guards
export {
  isCompleteResult,
  isQueryResultCancelled,
  isSessionMessage,
  isCompleteMessage,
  isErrorMessage,
  isMessageEvent,
  isReadyMessage,
  isHealthOkMessage,
  isCancelMessage,
  isQueryMessage,
  isShutdownMessage,
  findMessageByType,
  filterMessagesByType,
} from "./types.js"
