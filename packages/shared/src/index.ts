/**
 * @webalive/shared
 *
 * Shared constants and types used across all packages in the monorepo.
 *
 * @example
 * ```typescript
 * import { COOKIE_NAMES, ENV_VARS, PATHS, DOMAINS } from "@webalive/shared"
 *
 * const sessionCookieName = COOKIE_NAMES.SESSION // "auth_session"
 * const envVarName = ENV_VARS.STREAM_SESSION_COOKIE // "STREAM_SESSION_COOKIE"
 * const sitesRoot = PATHS.SITES_ROOT // "/srv/webalive/sites"
 * ```
 */

export {
  COOKIE_NAMES,
  SESSION_MAX_AGE,
  FREE_CREDITS,
  ENV_VARS,
  TEST_CONFIG,
  WORKER_POOL,
  STREAM_TYPES,
  STREAM_SYNTHETIC_MESSAGE_TYPES,
  STREAM_INTERRUPT_SOURCES,
  REFERRAL,
  LIMITS,
  WORKSPACE_STORAGE,
  PREVIEW_MESSAGES,
  FEATURE_FLAGS,
  STORE_STORAGE_KEYS,
  createWorkspaceStorageValue,
  createTestStorageState,
  type StreamType,
  type FeatureFlagDefinition,
  type FeatureFlagKey,
  type WorkspaceStorageRecentItem,
  type WorkspaceStorageState,
  type WorkspaceStorageValue,
  type TestStorageStateOptions,
  type StorageEntry,
} from "./constants.js"
export { generateInviteCode } from "./invite-code.js"
export {
  PATHS,
  DOMAINS,
  PORTS,
  TIMEOUTS,
  DEFAULTS,
  SECURITY,
  SUPERADMIN,
  STREAM_ENV,
  type StreamEnv,
  STANDALONE,
  BRIDGE_ENV,
  type BridgeEnv,
  getServiceName,
  getSiteUser,
  getSiteHome,
  getEnvFilePath,
  getServerId,
  validateConfig,
  assertConfigValid,
  type ConfigValidationResult,
} from "./config.js"
export {
  environments,
  getEnvironment,
  getAllEnvironments,
  getEnvironmentByPort,
  getEnvironmentByProcessName,
  getEnvironmentByDomain,
  type Environment,
  type EnvironmentKey,
} from "./environments.js"
export {
  // OAuth MCP providers (require authentication)
  OAUTH_MCP_PROVIDERS,
  getOAuthMcpProviderKeys,
  isValidOAuthMcpProviderKey,
  isOAuthMcpTool,
  getMcpToolFriendlyName,
  getOAuthKeyForProvider,
  getOAuthMcpProviderConfig,
  providerSupportsPat,
  providerSupportsOAuth,
  type OAuthMcpProviderConfig,
  type OAuthMcpProviderRegistry,
  type OAuthMcpProviderKey,
  type ProviderTokenMap,
  // OAuth-only providers (no MCP server, just token storage)
  OAUTH_ONLY_PROVIDERS,
  getOAuthOnlyProviderKeys,
  getAllOAuthProviderKeys,
  isValidOAuthProviderKey,
  type OAuthOnlyProviderConfig,
  type OAuthOnlyProviderRegistry,
  type OAuthOnlyProviderKey,
  type AllOAuthProviderKey,
  // Global MCP providers (always available, no auth required)
  GLOBAL_MCP_PROVIDERS,
  getGlobalMcpProviderKeys,
  getGlobalMcpToolNames,
  type GlobalMcpProviderConfig,
  type GlobalMcpProviderRegistry,
  type GlobalMcpProviderKey,
} from "./mcp-providers.js"
export {
  formatProviderName,
  type OAuthWarning,
  type OAuthWarningCategory,
  type OAuthWarningContent,
  type OAuthFetchResult,
} from "./oauth-warnings.js"
export {
  isPathWithinWorkspace,
  resolveAndValidatePath,
  type PathValidationResult,
} from "./path-security.js"
export {
  // SDK tool constants
  STREAM_ALLOWED_SDK_TOOLS,
  STREAM_ADMIN_ONLY_SDK_TOOLS,
  STREAM_ALWAYS_DISALLOWED_SDK_TOOLS,
  STREAM_PERMISSION_MODE,
  STREAM_SETTINGS_SOURCES,
  PLAN_MODE_BLOCKED_TOOLS,
  type StreamAllowedSDKTool,
  type StreamDisallowedSDKTool,
  type StreamAdminOnlySDKTool,
  type StreamAlwaysDisallowedSDKTool,
  type PlanModeBlockedTool,
  // Tool permission helpers
  allowTool,
  denyTool,
  filterToolsForPlanMode,
  // Helper functions
  getStreamAllowedTools,
  getStreamDisallowedTools,
  getStreamMcpServers,
  createStreamCanUseTool,
  getWorkspacePath,
  type StreamMcpServerConfig,
} from "./stream-tools.js"
export {
  // Claude models - SINGLE SOURCE OF TRUTH
  CLAUDE_MODELS,
  DEFAULT_CLAUDE_MODEL,
  isValidClaudeModel,
  getModelDisplayName,
  type ClaudeModel,
} from "./models.js"
export {
  // Output limiting utilities
  truncateOutput,
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_LINES,
  type TruncateOptions,
} from "./output-limits.js"
export {
  // Retry utilities
  retryAsync,
  resolveRetryConfig,
  computeBackoff,
  sleepWithAbort,
  type RetryConfig,
  type RetryInfo,
  type RetryOptions,
  type BackoffPolicy,
} from "./retry.js"
export {
  // Deduplication cache
  createDedupeCache,
  createPrefixedDedupeCache,
  type DedupeCache,
  type DedupeCacheOptions,
} from "./dedupe.js"
export {
  // Error utilities
  extractErrorCode,
  isAbortError,
  isFatalError,
  isConfigError,
  isTransientNetworkError,
  isRetryableNetworkError,
  formatUncaughtError,
} from "./errors.js"
export {
  // External content security (prompt injection protection)
  detectSuspiciousPatterns,
  wrapExternalContent,
  buildSafeExternalPrompt,
  isExternalHookSession,
  getHookType,
  sanitizePromptInput,
  type ExternalContentSource,
  type WrapExternalContentOptions,
} from "./external-content.js"
export {
  // Website templates - SINGLE SOURCE OF TRUTH
  TEMPLATES,
  TEMPLATE_IDS,
  isValidTemplateId,
  getTemplateById,
  getTemplateListForDocs,
  getTemplateIdsInline,
  type Template,
  type TemplateIcon,
  type TemplateId,
} from "./templates.js"
export {
  WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_DIRS,
  WORKSPACE_SCHEMA_VERSION_FILE,
  WORKSPACE_MIGRATIONS,
  getRequiredDirectories,
  type WorkspaceMigration,
  type WorkspaceDir,
} from "./workspace-schema.js"
