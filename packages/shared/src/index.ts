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
  type AutomationTriggerRequest,
  AutomationTriggerRequestSchema,
  type AutomationTriggerResponse,
  AutomationTriggerResponseSchema,
} from "./automation-schemas.js"
export {
  assertValidServerId,
  CONFIG_PATH,
  DEFAULTS,
  DOMAINS,
  getEnvFilePath,
  getServerId,
  getServiceName,
  getSiteHome,
  getSiteUser,
  PATHS,
  PORTS,
  requireEnv,
  resolveTemplatePath,
  SECURITY,
  STANDALONE,
  STREAM_ENV,
  type StreamEnv,
  SUPERADMIN,
  TIMEOUTS,
} from "./config.js"
export {
  COOKIE_NAMES,
  createTestStorageState,
  createWorkspaceStorageValue,
  ENV_VARS,
  FEATURE_FLAGS,
  type FeatureFlagDefinition,
  type FeatureFlagKey,
  FREE_CREDITS,
  LIMITS,
  PREVIEW_MESSAGES,
  REFERRAL,
  SESSION_MAX_AGE,
  STORE_STORAGE_KEYS,
  STREAM_INTERRUPT_SOURCES,
  STREAM_SYNTHETIC_MESSAGE_TYPES,
  STREAM_TYPES,
  STREAMING,
  type StorageEntry,
  type StreamType,
  TEST_CONFIG,
  type TestStorageStateOptions,
  WORKER_POOL,
  WORKSPACE_STORAGE,
  type WorkspaceStorageRecentItem,
  type WorkspaceStorageState,
  type WorkspaceStorageValue,
} from "./constants.js"
export {
  // Deduplication cache
  createDedupeCache,
  createPrefixedDedupeCache,
  type DedupeCache,
  type DedupeCacheOptions,
} from "./dedupe.js"
export {
  type Environment,
  type EnvironmentKey,
  environments,
  getAllEnvironments,
  getEnvironment,
  getEnvironmentByDomain,
  getEnvironmentByPort,
  getEnvironmentByProcessName,
} from "./environments.js"
export {
  // Error utilities
  extractErrorCode,
  formatUncaughtError,
  isAbortError,
  isConfigError,
  isFatalError,
  isRetryableNetworkError,
  isTransientNetworkError,
} from "./errors.js"
export {
  buildSafeExternalPrompt,
  // External content security (prompt injection protection)
  detectSuspiciousPatterns,
  type ExternalContentSource,
  getHookType,
  isExternalHookSession,
  sanitizePromptInput,
  type WrapExternalContentOptions,
  wrapExternalContent,
} from "./external-content.js"
export { generateInviteCode } from "./invite-code.js"
export {
  type AllOAuthProviderKey,
  // Global MCP providers (always available, no auth required)
  GLOBAL_MCP_PROVIDERS,
  type GlobalMcpProviderConfig,
  type GlobalMcpProviderKey,
  type GlobalMcpProviderRegistry,
  getAllOAuthProviderKeys,
  getGlobalMcpProviderKeys,
  getGlobalMcpToolNames,
  getMcpToolFriendlyName,
  getOAuthKeyForProvider,
  getOAuthMcpProviderConfig,
  getOAuthMcpProviderKeys,
  getOAuthOnlyProviderKeys,
  isOAuthMcpTool,
  isValidOAuthMcpProviderKey,
  isValidOAuthProviderKey,
  // OAuth MCP providers (require authentication)
  OAUTH_MCP_PROVIDERS,
  // OAuth-only providers (no MCP server, just token storage)
  OAUTH_ONLY_PROVIDERS,
  type OAuthMcpProviderConfig,
  type OAuthMcpProviderKey,
  type OAuthMcpProviderRegistry,
  type OAuthOnlyProviderConfig,
  type OAuthOnlyProviderKey,
  type OAuthOnlyProviderRegistry,
  type ProviderTokenMap,
  providerSupportsOAuth,
  providerSupportsPat,
} from "./mcp-providers.js"
export {
  // Claude models - SINGLE SOURCE OF TRUTH
  CLAUDE_MODELS,
  type ClaudeModel,
  DEFAULT_CLAUDE_MODEL,
  getModelDisplayName,
  isValidClaudeModel,
} from "./models.js"
export {
  formatProviderName,
  type OAuthFetchResult,
  type OAuthWarning,
  type OAuthWarningCategory,
  type OAuthWarningContent,
} from "./oauth-warnings.js"
export {
  buildSessionOrgClaims,
  isOrgAdminRole,
  isOrgRole,
  isOrgRoleWithViewer,
  ORG_ROLES,
  ORG_ROLES_WITH_VIEWER,
  type OrgMembershipLike,
  type OrgRole,
  type OrgRoleMap,
  type OrgRoleWithViewer,
  type SessionOrgClaims,
} from "./org-roles.js"
export {
  DEFAULT_MAX_CHARS,
  DEFAULT_MAX_LINES,
  type TruncateOptions,
  // Output limiting utilities
  truncateOutput,
} from "./output-limits.js"
export {
  isPathWithinWorkspace,
  type PathValidationResult,
  resolveAndValidatePath,
} from "./path-security.js"
export {
  type BackoffPolicy,
  computeBackoff,
  type RetryConfig,
  type RetryInfo,
  type RetryOptions,
  resolveRetryConfig,
  // Retry utilities
  retryAsync,
  sleepWithAbort,
} from "./retry.js"
export { parseServerConfig, type ServerConfig, serverConfigSchema } from "./server-config-schema.js"
export {
  // Stream protocol events
  type BaseStreamEvent,
  ERROR_CODES,
  type ErrorCode,
  type InterruptSource,
  isStreamEvent,
  STREAM_EVENT_TYPES,
  STREAM_PROTOCOL_VERSION,
  type StreamChunkEvent,
  type StreamCompleteEvent,
  type StreamErrorEvent,
  type StreamEvent,
  type StreamEventType,
  type StreamInterruptEvent,
  type StreamMessageEvent,
  type StreamMessageType,
  type StreamStartEvent,
  type StreamState,
  type StreamStateEvent,
} from "./stream-events.js"
export {
  // Stream token types
  type CancelResponse,
  type ReplayResponse,
  type StreamStartRequest,
  type StreamStartResponse,
  type StreamTokenPayload,
  TOKEN_CONFIG,
  type TokenRequest,
  type TokenResponse,
} from "./stream-tokens.js"
export {
  // Tool permission helpers
  allowTool,
  buildStreamToolRuntimeConfig,
  createStreamCanUseTool,
  createStreamToolContext,
  denyTool,
  // Helper functions
  getStreamAllowedTools,
  getStreamDisallowedTools,
  getStreamMcpServers,
  getStreamToolDecision,
  getStreamToolRole,
  getStreamWorkspaceKind,
  getWorkspacePath,
  isHeavyBashCommand,
  isStreamClientVisibleTool,
  isStreamPolicyTool,
  // Stream tool policy constants/types
  STREAM_INTERNAL_MCP_TOOLS,
  STREAM_PERMISSION_MODE,
  STREAM_SDK_TOOL_NAMES,
  STREAM_SETTINGS_SOURCES,
  STREAM_TOOL_POLICY_REGISTRY,
  type StreamInternalMcpToolName,
  type StreamMcpServerConfig,
  type StreamPlanModeBehavior,
  type StreamPolicyToolName,
  type StreamSdkToolName,
  type StreamToolContext,
  type StreamToolDecision,
  type StreamToolRole,
  type StreamToolRuntimeConfig,
  type StreamToolVisibility,
  type StreamWorkspaceKind,
} from "./stream-tools.js"
export {
  getTemplateById,
  getTemplateIdsInline,
  getTemplateListForDocs,
  isValidTemplateId,
  TEMPLATE_IDS,
  // Website templates - SINGLE SOURCE OF TRUTH
  TEMPLATES,
  type Template,
  type TemplateIcon,
  type TemplateId,
} from "./templates.js"
export {
  getRequiredDirectories,
  WORKSPACE_DIRS,
  WORKSPACE_MIGRATIONS,
  WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_SCHEMA_VERSION_FILE,
  type WorkspaceDir,
  type WorkspaceMigration,
} from "./workspace-schema.js"
