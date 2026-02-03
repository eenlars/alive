/**
 * OAuth Audit Logging
 *
 * Structured audit trail for security-relevant OAuth operations.
 * Follows best practices:
 * - No sensitive data (tokens, secrets) in logs
 * - Consistent structured format for log aggregation
 * - Correlation IDs for tracing operations
 * - Timestamps for security analysis
 */

export type OAuthAuditEventType =
  | "auth_initiated" // OAuth flow started
  | "auth_completed" // Tokens received
  | "auth_failed" // OAuth flow failed
  | "token_refresh_started" // Token refresh initiated
  | "token_refresh_completed" // Token refresh succeeded
  | "token_refresh_failed" // Token refresh failed
  | "token_revoked" // Token revoked
  | "provider_config_updated" // OAuth app credentials changed
  | "user_env_key_updated" // User environment key changed

export interface OAuthAuditEvent {
  /** Event type */
  type: OAuthAuditEventType
  /** Timestamp in ISO format */
  timestamp: string
  /** Provider name (e.g., "linear", "google") */
  provider: string
  /** User ID (truncated for privacy) */
  userId?: string
  /** Tenant ID (for multi-tenant setups) */
  tenantId?: string
  /** Correlation ID for tracing related operations */
  correlationId?: string
  /** Whether operation succeeded */
  success: boolean
  /** Error message (if failed) */
  error?: string
  /** Additional metadata (no secrets!) */
  metadata?: Record<string, string | number | boolean | undefined>
}

/**
 * Truncate user ID for privacy in logs
 * Shows first 8 chars + "..." for debugging without exposing full ID
 */
function truncateUserId(userId: string): string {
  if (userId.length <= 12) {
    return `${userId.slice(0, 4)}...`
  }
  return `${userId.slice(0, 8)}...`
}

/**
 * Generate a correlation ID for tracing
 */
function generateCorrelationId(): string {
  return `oauth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * OAuth audit logger interface
 * Implement this to customize where audit logs go
 */
export interface OAuthAuditLogger {
  log(event: OAuthAuditEvent): void
}

/**
 * Default console-based audit logger
 * Outputs structured JSON for log aggregation tools
 */
export class ConsoleAuditLogger implements OAuthAuditLogger {
  private readonly prefix: string

  constructor(prefix = "[OAuth Audit]") {
    this.prefix = prefix
  }

  log(event: OAuthAuditEvent): void {
    const logFn = event.success ? console.info : console.warn
    logFn(this.prefix, JSON.stringify(event))
  }
}

/**
 * No-op audit logger for testing or when audit is disabled
 */
export class NoopAuditLogger implements OAuthAuditLogger {
  log(_event: OAuthAuditEvent): void {
    // Intentionally empty
  }
}

/**
 * Audit logger singleton with pluggable backend
 */
class OAuthAudit {
  private logger: OAuthAuditLogger = new ConsoleAuditLogger()
  private enabled = true

  /**
   * Set the audit logger implementation
   */
  setLogger(logger: OAuthAuditLogger): void {
    this.logger = logger
  }

  /**
   * Enable or disable audit logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /**
   * Log an OAuth audit event
   */
  log(
    type: OAuthAuditEventType,
    provider: string,
    options: {
      userId?: string
      tenantId?: string
      correlationId?: string
      success?: boolean
      error?: string
      metadata?: Record<string, string | number | boolean | undefined>
    } = {},
  ): string {
    const correlationId = options.correlationId || generateCorrelationId()

    if (!this.enabled) {
      return correlationId
    }

    const event: OAuthAuditEvent = {
      type,
      timestamp: new Date().toISOString(),
      provider,
      userId: options.userId ? truncateUserId(options.userId) : undefined,
      tenantId: options.tenantId ? truncateUserId(options.tenantId) : undefined,
      correlationId,
      success: options.success ?? true,
      error: options.error,
      metadata: options.metadata,
    }

    this.logger.log(event)
    return correlationId
  }

  /**
   * Log auth flow initiated
   */
  authInitiated(provider: string, userId?: string, tenantId?: string): string {
    return this.log("auth_initiated", provider, { userId, tenantId })
  }

  /**
   * Log auth flow completed
   */
  authCompleted(
    provider: string,
    userId: string,
    options?: { tenantId?: string; correlationId?: string; hasRefreshToken?: boolean },
  ): void {
    this.log("auth_completed", provider, {
      userId,
      tenantId: options?.tenantId,
      correlationId: options?.correlationId,
      success: true,
      metadata: { hasRefreshToken: options?.hasRefreshToken },
    })
  }

  /**
   * Log auth flow failed
   */
  authFailed(
    provider: string,
    error: string,
    options?: { userId?: string; tenantId?: string; correlationId?: string },
  ): void {
    this.log("auth_failed", provider, {
      userId: options?.userId,
      tenantId: options?.tenantId,
      correlationId: options?.correlationId,
      success: false,
      error,
    })
  }

  /**
   * Log token refresh started
   */
  tokenRefreshStarted(provider: string, userId: string): string {
    return this.log("token_refresh_started", provider, { userId })
  }

  /**
   * Log token refresh completed
   */
  tokenRefreshCompleted(provider: string, userId: string, correlationId?: string): void {
    this.log("token_refresh_completed", provider, {
      userId,
      correlationId,
      success: true,
    })
  }

  /**
   * Log token refresh failed
   */
  tokenRefreshFailed(provider: string, userId: string, error: string, correlationId?: string): void {
    this.log("token_refresh_failed", provider, {
      userId,
      correlationId,
      success: false,
      error,
    })
  }

  /**
   * Log token revoked
   */
  tokenRevoked(provider: string, userId: string, options?: { tenantId?: string }): void {
    this.log("token_revoked", provider, {
      userId,
      tenantId: options?.tenantId,
      success: true,
    })
  }

  /**
   * Log provider config updated
   */
  providerConfigUpdated(provider: string, tenantId: string): void {
    this.log("provider_config_updated", provider, {
      tenantId,
      success: true,
    })
  }

  /**
   * Log user env key updated
   */
  userEnvKeyUpdated(userId: string, keyName: string): void {
    this.log("user_env_key_updated", "env_keys", {
      userId,
      success: true,
      metadata: { keyName },
    })
  }
}

/**
 * Global audit logger instance
 */
export const oauthAudit = new OAuthAudit()
