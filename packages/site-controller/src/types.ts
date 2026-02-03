/**
 * Configuration for deploying a site
 */
export interface DeployConfig {
  /** The domain name (e.g., example.com) */
  domain: string
  /** The slug for the domain (e.g., example-com) */
  slug: string
  /** Path to the template directory */
  templatePath: string
  /** Whether to rollback on failure (default: true) */
  rollbackOnFailure?: boolean
  /** Server IP for DNS validation */
  serverIp?: string
  /** Wildcard domain to skip DNS validation */
  wildcardDomain?: string
}

/**
 * Result of a deployment operation
 */
export interface DeployResult {
  /** The deployed domain */
  domain: string
  /** The assigned port */
  port: number
  /** The systemd service name */
  serviceName: string
  /** Whether the deployment succeeded */
  success: boolean
  /** Error message if deployment failed */
  error?: string
  /** Which phase failed (if applicable) */
  failedPhase?: string
}

/**
 * DNS validation result
 */
export interface DnsValidationResult {
  /** Whether DNS is configured correctly */
  valid: boolean
  /** The resolved IP address */
  resolvedIp?: string
  /** Validation message */
  message: string
}

/**
 * Port assignment result
 */
export interface PortAssignment {
  /** The assigned port number */
  port: number
  /** Whether this is a new assignment */
  isNew: boolean
}
