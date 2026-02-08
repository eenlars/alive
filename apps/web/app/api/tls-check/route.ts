/**
 * TLS Check endpoint for Caddy on-demand TLS
 *
 * Caddy calls this endpoint before obtaining a TLS certificate for a domain.
 * Returns 200 if the domain is a valid preview subdomain, 403 otherwise.
 *
 * Preview subdomains use the single-level pattern: preview--{label}.{WILDCARD}
 * Domain-agnostic: validates against PREVIEW_PREFIX and WILDCARD domain.
 *
 * Caddy config:
 *   on_demand_tls {
 *     ask http://localhost:9000/api/tls-check
 *   }
 */

import { DOMAINS } from "@webalive/shared"

const PREVIEW_PREFIX = DOMAINS.PREVIEW_PREFIX

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const domain = url.searchParams.get("domain")

  if (!domain) {
    return new Response("Missing domain parameter", { status: 400 })
  }

  const wildcard = DOMAINS.WILDCARD
  if (!wildcard) {
    return new Response("Wildcard domain not configured", { status: 500 })
  }

  // Allow preview subdomains: preview--{label}.{WILDCARD}
  const suffix = `.${wildcard}`
  if (
    domain.startsWith(PREVIEW_PREFIX) &&
    domain.endsWith(suffix) &&
    domain.length > PREVIEW_PREFIX.length + suffix.length
  ) {
    return new Response("OK", { status: 200 })
  }

  return new Response("Domain not allowed for TLS", { status: 403 })
}
