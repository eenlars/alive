import { runScriptSafe } from './common.js'
import type { DnsValidationResult } from '../types.js'

export interface ValidateDnsParams {
  domain: string
  serverIp: string
  wildcardDomain: string
}

/**
 * Validate DNS configuration for a domain
 *
 * @param params - DNS validation parameters
 * @returns DNS validation result
 */
export async function validateDns(
  params: ValidateDnsParams
): Promise<DnsValidationResult> {
  const result = await runScriptSafe('00-validate-dns.sh', {
    SITE_DOMAIN: params.domain,
    SERVER_IP: params.serverIp,
    WILDCARD_DOMAIN: params.wildcardDomain,
  })

  if (result.exitCode === 0) {
    // Extract resolved IP from stdout if available
    const ipMatch = result.stdout.match(/Resolved IP: ([\d.]+)/)
    const resolvedIp = ipMatch ? ipMatch[1] : undefined

    return {
      valid: true,
      resolvedIp,
      message: 'DNS validation passed',
    }
  }

  // DNS validation failed (exit code 12)
  return {
    valid: false,
    message: result.stderr || 'DNS validation failed',
  }
}
