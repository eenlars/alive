import type { Request, Response, Router } from "express"

const API_SCHEMA = {
  service: "stealth-request",
  description:
    "Web scraping proxy and reconnaissance toolkit. Puppeteer-based stealth fetching, framework detection, subdomain discovery, DNS records, WHOIS, and port scanning.",
  baseUrl: "http://127.0.0.1:1234",
  publicUrl: "https://scrape.alive.best",
  endpoints: [
    {
      method: "GET",
      path: "/health",
      description: "Health check. Returns service status.",
      params: null,
      response: { status: "string", service: "string", port: "number" },
      example: { curl: "curl https://scrape.alive.best/health" },
    },
    {
      method: "GET",
      path: "/discover",
      description: "This endpoint. Returns the full API schema for all endpoints, params, and response shapes.",
      params: null,
      response: "this object",
    },
    {
      method: "POST",
      path: "/fetch",
      description:
        "Fetch a URL using a headless Chromium browser with stealth anti-detection. Supports DOM interaction, screenshots, link extraction, pagination following, JS execution, and response caching. Retries transient failures (timeouts, Cloudflare challenges) with exponential backoff.",
      params: {
        url: { type: "string", required: true, description: "URL to fetch" },
        method: {
          type: "string",
          required: false,
          default: "GET",
          description: "HTTP method (GET, POST, PUT, PATCH, DELETE)",
        },
        headers: { type: "Record<string, string>", required: false, description: "Custom HTTP headers" },
        body: { type: "Record<string, unknown>", required: false, description: "Request body (non-GET only)" },
        timeout: { type: "number", required: false, default: 60000, description: "Timeout in milliseconds" },
        format: {
          type: "string",
          required: false,
          default: "html",
          description: "'html' or 'markdown'. Markdown strips nav/header/footer and converts to clean markdown.",
        },
        retry: {
          type: "number",
          required: false,
          default: 2,
          description: "Retry count on transient failures (0-5). Set to 0 to disable.",
        },
        cache: {
          type: "number",
          required: false,
          description: "Cache TTL in seconds. Subsequent identical requests return instantly from memory.",
        },
        waitFor: {
          type: "string",
          required: false,
          description: "CSS selector to wait for before capturing content (GET only)",
        },
        extractLinks: {
          type: "boolean",
          required: false,
          default: false,
          description: "Return [{href, text}] instead of HTML (GET only)",
        },
        screenshot: {
          type: "boolean | {type: 'png'|'webp', fullPage: boolean}",
          required: false,
          default: false,
          description: "Return base64 screenshot instead of HTML (GET only)",
        },
        executeJs: {
          type: "string",
          required: false,
          description: "JavaScript snippet to run in page context. Result returned in 'jsResult' field (GET only)",
        },
        followPagination: {
          type: "{selector: string, maxPages: number}",
          required: false,
          description: "Click a 'next' selector repeatedly, collecting content from each page (GET only, max 50 pages)",
        },
        recordNetworkRequests: {
          type: "boolean",
          required: false,
          default: false,
          description: "Capture all network requests/responses during page load",
        },
        originUrl: {
          type: "string",
          required: false,
          description:
            "Navigate here first for cookie collection before fetching the target URL (useful for cross-subdomain APIs)",
        },
      },
      response: {
        success: "boolean",
        status: "number",
        statusText: "string",
        headers: "Record<string, string>",
        body: "string | ExtractedLink[] | string (base64)",
        url: "string",
        format: "'html' | 'links' | 'screenshot'",
        cached: "boolean (only present on cache hit)",
        attempts: "number (only present if retried)",
        jsResult: "unknown (only present if executeJs was used)",
        paginatedPages: "array (only present if followPagination produced non-link results)",
        networkRequests: "array (only present if recordNetworkRequests was true)",
      },
      example: {
        curl: `curl -X POST https://scrape.alive.best/fetch -H "Content-Type: application/json" -d '{"url": "https://example.com", "waitFor": "h1", "format": "markdown"}'`,
      },
    },
    {
      method: "POST",
      path: "/fetch-batch",
      description:
        "Fetch multiple URLs in parallel. Each request uses the same params as /fetch. Results are returned in order with per-request success/failure.",
      params: {
        requests: { type: "array of /fetch params", required: true, description: "Array of request objects (max 50)" },
        concurrency: { type: "number", required: false, default: 5, description: "Max concurrent browser instances" },
      },
      response: {
        success: "boolean",
        results: "Array<{status: 'fulfilled'|'rejected', value?: object, reason?: string, index: number}>",
      },
      example: {
        curl: `curl -X POST https://scrape.alive.best/fetch-batch -H "Content-Type: application/json" -d '{"requests": [{"url": "https://example.com"}, {"url": "https://httpbin.org/html"}], "concurrency": 2}'`,
      },
    },
    {
      method: "POST",
      path: "/detect-framework",
      description:
        "Detect web frameworks, CMS, platforms, CDN, and server software using lightweight HEAD requests and HTTP header analysis. No browser needed — runs in ~100-200ms.",
      params: {
        url: { type: "string", required: true, description: "URL or domain to analyze" },
        only: {
          type: "string[]",
          required: false,
          description: "Filter by probe IDs or categories: 'framework', 'cms', 'platform', 'server', 'cdn'",
        },
      },
      response: {
        success: "boolean",
        url: "string (normalized to origin)",
        rootStatus: "number",
        detected: "Array<{id, name, category, evidence}>",
        allProbes: "Array<{id, name, category, matched, status?, evidence?, error?}>",
        durationMs: "number",
      },
      related: { "GET /detect-framework/probes": "Lists all available probes grouped by category" },
      example: {
        curl: `curl -X POST https://scrape.alive.best/detect-framework -H "Content-Type: application/json" -d '{"url": "https://vercel.com"}'`,
      },
    },
    {
      method: "POST",
      path: "/discover-subdomains",
      description:
        "Discover subdomains using Certificate Transparency logs (crt.sh), DNS record extraction, and brute-force DNS resolution of 140 common prefixes.",
      params: {
        domain: { type: "string", required: true, description: "Root domain (e.g. 'example.com')" },
        methods: {
          type: "('ct' | 'dns' | 'bruteforce')[]",
          required: false,
          default: ["ct", "dns", "bruteforce"],
          description: "Which discovery methods to use",
        },
      },
      response: {
        success: "boolean",
        domain: "string",
        total: "number",
        alive: "number",
        subdomains: "Array<{subdomain, source: 'ct'|'dns', ip?: string[]}>",
        methods: "string[]",
        durationMs: "number",
      },
      related: { "GET /discover-subdomains/wordlist": "Shows the 140-entry brute-force wordlist" },
      example: {
        curl: `curl -X POST https://scrape.alive.best/discover-subdomains -H "Content-Type: application/json" -d '{"domain": "example.com"}'`,
      },
    },
    {
      method: "POST",
      path: "/dns-records",
      description:
        "Full DNS record dump for a domain. Resolves A, AAAA, MX, NS, TXT, CNAME, SOA, and CAA records concurrently.",
      params: {
        domain: { type: "string", required: true, description: "Domain to query" },
      },
      response: {
        success: "boolean",
        domain: "string",
        records: {
          A: "string[]",
          AAAA: "string[]",
          MX: "Array<{priority, exchange}>",
          NS: "string[]",
          TXT: "string[]",
          CNAME: "string[]",
          SOA: "object | null",
          CAA: "array",
        },
        durationMs: "number",
      },
      example: {
        curl: `curl -X POST https://scrape.alive.best/dns-records -H "Content-Type: application/json" -d '{"domain": "example.com"}'`,
      },
    },
    {
      method: "POST",
      path: "/whois",
      description:
        "Domain registration info via RDAP (modern JSON WHOIS). Auto-discovers the correct RDAP server for any TLD.",
      params: {
        domain: { type: "string", required: true, description: "Domain to look up" },
      },
      response: {
        success: "boolean",
        domain: "string",
        registrar: "string",
        created: "string (ISO 8601)",
        updated: "string (ISO 8601)",
        expires: "string (ISO 8601) | null",
        nameservers: "string[]",
        dnssec: "boolean",
        status: "string[]",
        rdapUrl: "string",
        durationMs: "number",
      },
      example: {
        curl: `curl -X POST https://scrape.alive.best/whois -H "Content-Type: application/json" -d '{"domain": "example.com"}'`,
      },
    },
    {
      method: "POST",
      path: "/port-scan",
      description:
        "TCP connect scan on common service ports with banner grabbing. 15 concurrent probes, max 100 ports per scan.",
      params: {
        host: { type: "string", required: true, description: "IP address or domain to scan" },
        ports: {
          type: "number[]",
          required: false,
          default: "23 common ports",
          description: "Custom port list (max 100)",
        },
      },
      response: {
        success: "boolean",
        host: "string",
        ip: "string",
        scanned: "number",
        open: "number",
        ports: "Array<{port, service, open: true, banner?}>",
        allPorts: "Array<{port, service, open, banner?}>",
        durationMs: "number",
      },
      related: { "GET /port-scan/ports": "Lists the 23 default ports and their service names" },
      example: {
        curl: `curl -X POST https://scrape.alive.best/port-scan -H "Content-Type: application/json" -d '{"host": "example.com"}'`,
      },
    },
    {
      method: "POST",
      path: "/analyze-js",
      description:
        "Download and analyze a site's JavaScript bundles. Extracts API endpoints, environment variable leaks, version strings, source map URLs, potential secrets, GraphQL operations, and internal project paths.",
      params: {
        url: { type: "string", required: true, description: "URL to analyze" },
        html: { type: "string", required: false, description: "Pre-fetched HTML (skip the initial page fetch)" },
      },
      response: {
        success: "boolean",
        url: "string",
        scriptsFound: "number",
        scriptsAnalyzed: "number",
        inlineScripts: "number",
        totalJsSize: "number",
        summary: {
          apiEndpoints: "string[]",
          envVars: "Array<{name, value?}>",
          versions: "Array<{lib, version}>",
          sourceMaps: "string[]",
          secrets: "Array<{type, value, context}>",
          graphql: "string[]",
          internalPaths: "string[]",
        },
        perBundle: "Array<{url, size, apiEndpoints, envVars, secrets, sourceMaps}>",
        durationMs: "number",
      },
      example: {
        curl: `curl -X POST https://scrape.alive.best/analyze-js -H "Content-Type: application/json" -d '{"url": "https://vercel.com"}'`,
      },
    },
  ],
}

export function registerDiscoverRoutes(router: Router) {
  router.get("/discover", (_req: Request, res: Response) => {
    res.json(API_SCHEMA)
  })
}
