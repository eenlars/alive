export type DeploymentErrorCode =
  | "DNS_VALIDATION_FAILED"
  | "INVALID_DOMAIN"
  | "PATH_TRAVERSAL"
  | "SITE_EXISTS"
  | "PORT_ASSIGNMENT_FAILED"
  | "USER_CREATION_FAILED"
  | "FILESYSTEM_ERROR"
  | "BUILD_FAILED"
  | "SERVICE_START_FAILED"
  | "CADDY_CONFIG_FAILED"
  | "ROLLBACK_FAILED"
  | "UNKNOWN"

export class DeploymentError extends Error {
  readonly code: DeploymentErrorCode
  readonly statusCode: number

  constructor(code: DeploymentErrorCode, message: string, statusCode = 500) {
    super(message)
    this.name = "DeploymentError"
    this.code = code
    this.statusCode = statusCode
  }

  static dnsValidationFailed(message: string): DeploymentError {
    return new DeploymentError("DNS_VALIDATION_FAILED", message, 400)
  }

  static invalidDomain(domain: string): DeploymentError {
    return new DeploymentError("INVALID_DOMAIN", `Invalid domain format: ${domain}`, 400)
  }

  static pathTraversal(domain: string): DeploymentError {
    return new DeploymentError("PATH_TRAVERSAL", `Path traversal detected in domain: ${domain}`, 400)
  }

  static siteExists(domain: string): DeploymentError {
    return new DeploymentError("SITE_EXISTS", `Site already exists: ${domain}`, 409)
  }

  static portAssignmentFailed(message: string): DeploymentError {
    return new DeploymentError("PORT_ASSIGNMENT_FAILED", message, 500)
  }

  static serviceFailed(message: string): DeploymentError {
    return new DeploymentError("SERVICE_START_FAILED", message, 500)
  }

  static rollbackFailed(message: string): DeploymentError {
    return new DeploymentError("ROLLBACK_FAILED", message, 500)
  }

  /** Generic error for backward compatibility */
  static generic(message: string): DeploymentError {
    return new DeploymentError("UNKNOWN", message, 500)
  }
}
