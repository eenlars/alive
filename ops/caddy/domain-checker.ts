// Simple domain checker for Caddy on-demand TLS
// Returns 200 for *.alive.best domains, 403 otherwise
// Run with: bun run /root/webalive/claude-bridge/ops/caddy/domain-checker.ts

const ALLOWED_PATTERNS = [/\.alive\.best$/, /\.goalive\.nl$/]

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
