/**
 * TLS Check endpoint for Caddy on-demand TLS
 *
 * Caddy calls this endpoint before obtaining a TLS certificate for a domain.
 * Returns 200 if the domain is allowed, 403 otherwise.
 *
 * Allowed domains:
 * - The wildcard domain itself (e.g., sonno.tech)
 * - Any subdomain of the wildcard (e.g., dev.sonno.tech, preview--foo.sonno.tech)
 *
 * Caddy v2.10.2+ checks this endpoint for ALL domains (not just on-demand),
 * so we must accept explicitly configured domains too.
 *
 * Caddy config:
 *   on_demand_tls {
 *     ask http://localhost:9000/api/tls-check
 *   }
 */

import { DOMAINS } from "@webalive/shared"

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

  // Allow the wildcard domain itself and any single-level subdomain
  if (domain === wildcard || domain.endsWith(`.${wildcard}`)) {
    return new Response("OK", { status: 200 })
  }

  return new Response("Domain not allowed for TLS", { status: 403 })
}
