// Simple domain checker for Caddy on-demand TLS
// Returns 200 for domains matching configured patterns, 403 otherwise
// Run with: bun run ops/caddy/domain-checker.ts

import { DOMAINS } from "@webalive/shared"

// Build allowed patterns from config
const ALLOWED_PATTERNS: RegExp[] = []

if (DOMAINS.WILDCARD) {
  ALLOWED_PATTERNS.push(new RegExp(`\\.${DOMAINS.WILDCARD.replace(/\./g, "\\.")}$`))
}
if (DOMAINS.MAIN) {
  ALLOWED_PATTERNS.push(new RegExp(`\\.${DOMAINS.MAIN.replace(/\./g, "\\.")}$`))
}

const server = Bun.serve({
  port: 9999,
  fetch(req) {
    const url = new URL(req.url)
    const domain = url.searchParams.get("domain")

    if (!domain) {
      return new Response("Missing domain parameter", { status: 400 })
    }

    const isAllowed = ALLOWED_PATTERNS.some(pattern => pattern.test(domain))

    if (isAllowed) {
      console.log(`[OK] ${domain}`)
      return new Response("OK", { status: 200 })
    } else {
      console.log(`[DENIED] ${domain}`)
      return new Response("Forbidden", { status: 403 })
    }
  },
})

console.log(`Domain checker running on port ${server.port}`)
console.log(`Allowed patterns: ${ALLOWED_PATTERNS.map(p => p.source).join(", ")}`)
