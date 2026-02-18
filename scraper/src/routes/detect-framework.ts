import type { Request, Response, Router } from "express"

type ProbeMethod = "HEAD" | "GET"

type FrameworkProbe = {
  id: string
  name: string
  path: string | null
  method: ProbeMethod
  confirmStatus: number[]
  headers: Record<string, string>
  category: "framework" | "cms" | "platform" | "server" | "cdn"
}

const PROBES: FrameworkProbe[] = [
  // Frameworks
  {
    id: "nextjs",
    name: "Next.js",
    path: "/_next/static/",
    method: "HEAD",
    confirmStatus: [200, 301, 302, 403],
    headers: {},
    category: "framework",
  },
  {
    id: "nextjs-header",
    name: "Next.js",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { "x-powered-by": "Next.js" },
    category: "framework",
  },
  {
    id: "nuxt",
    name: "Nuxt",
    path: "/_nuxt/",
    method: "HEAD",
    confirmStatus: [200, 301, 302, 403],
    headers: {},
    category: "framework",
  },
  {
    id: "gatsby",
    name: "Gatsby",
    path: "/page-data/index/page-data.json",
    method: "HEAD",
    confirmStatus: [200],
    headers: {},
    category: "framework",
  },
  {
    id: "remix",
    name: "Remix",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { "x-remix-response": "" },
    category: "framework",
  },
  {
    id: "astro",
    name: "Astro",
    path: "/_astro/",
    method: "HEAD",
    confirmStatus: [200, 301, 302, 403],
    headers: {},
    category: "framework",
  },
  {
    id: "vite",
    name: "Vite",
    path: "/@vite/client",
    method: "HEAD",
    confirmStatus: [200],
    headers: {},
    category: "framework",
  },
  {
    id: "svelte",
    name: "SvelteKit",
    path: "/_app/",
    method: "HEAD",
    confirmStatus: [200, 301, 302, 403],
    headers: {},
    category: "framework",
  },
  {
    id: "angular",
    name: "Angular",
    path: "/ngsw.json",
    method: "HEAD",
    confirmStatus: [200],
    headers: {},
    category: "framework",
  },

  // CMS
  {
    id: "wordpress",
    name: "WordPress",
    path: "/wp-content/",
    method: "HEAD",
    confirmStatus: [200, 301, 302, 403],
    headers: {},
    category: "cms",
  },
  {
    id: "wordpress-login",
    name: "WordPress",
    path: "/wp-login.php",
    method: "HEAD",
    confirmStatus: [200, 302],
    headers: {},
    category: "cms",
  },
  {
    id: "drupal",
    name: "Drupal",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { "x-drupal-cache": "" },
    category: "cms",
  },
  {
    id: "ghost",
    name: "Ghost",
    path: "/ghost/api/",
    method: "HEAD",
    confirmStatus: [200, 301, 401],
    headers: {},
    category: "cms",
  },

  // Platforms
  {
    id: "shopify",
    name: "Shopify",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { "x-shopify-stage": "" },
    category: "platform",
  },
  {
    id: "webflow",
    name: "Webflow",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { "x-powered-by": "Webflow" },
    category: "platform",
  },
  {
    id: "squarespace",
    name: "Squarespace",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { server: "Squarespace" },
    category: "platform",
  },
  {
    id: "wix",
    name: "Wix",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { "x-wix-request-id": "" },
    category: "platform",
  },
  {
    id: "vercel",
    name: "Vercel",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { "x-vercel-id": "" },
    category: "platform",
  },
  {
    id: "netlify",
    name: "Netlify",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304],
    headers: { "x-nf-request-id": "" },
    category: "platform",
  },

  // CDN / Server
  {
    id: "cloudflare",
    name: "Cloudflare",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304, 403, 503],
    headers: { server: "cloudflare" },
    category: "cdn",
  },
  {
    id: "nginx",
    name: "nginx",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304, 403],
    headers: { server: "nginx" },
    category: "server",
  },
  {
    id: "apache",
    name: "Apache",
    path: null,
    method: "HEAD",
    confirmStatus: [200, 301, 302, 304, 403],
    headers: { server: "Apache" },
    category: "server",
  },
]

const DETECT_TIMEOUT_MS = 8_000

type ProbeResult = {
  id: string
  name: string
  category: string
  matched: boolean
  status?: number
  evidence?: string
  error?: string
}

async function runProbe(baseUrl: string, probe: FrameworkProbe, rootHeaders: Headers | null): Promise<ProbeResult> {
  const base: ProbeResult = { id: probe.id, name: probe.name, category: probe.category, matched: false }

  if (probe.path === null) {
    if (!rootHeaders) return { ...base, error: "root request failed" }
    const headerMatches = Object.entries(probe.headers).every(([key, substring]) => {
      const val = rootHeaders.get(key)
      if (!val) return false
      return substring === "" || val.toLowerCase().includes(substring.toLowerCase())
    })
    if (!headerMatches) return base
    return { ...base, matched: true, evidence: `header: ${Object.keys(probe.headers).join(", ")}` }
  }

  try {
    const url = new URL(probe.path, baseUrl).href
    const resp = await fetch(url, {
      method: probe.method,
      redirect: "manual",
      signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AliveBot/1.0)" },
    })
    const statusMatch = probe.confirmStatus.includes(resp.status)
    const headerMatch = Object.entries(probe.headers).every(([key, substring]) => {
      const val = resp.headers.get(key)
      if (!val) return false
      return substring === "" || val.toLowerCase().includes(substring.toLowerCase())
    })
    const matched = statusMatch && headerMatch
    return {
      ...base,
      matched,
      status: resp.status,
      evidence: matched ? `${probe.method} ${probe.path} → ${resp.status}` : undefined,
    }
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerDetectFrameworkRoutes(router: Router): void {
  router.get("/detect-framework/probes", (_req: Request, res: Response) => {
    const grouped: Record<
      string,
      Array<{ id: string; name: string; path: string | null; method: string; headers: Record<string, string> }>
    > = {}
    for (const p of PROBES) {
      const list = grouped[p.category] ?? []
      list.push({ id: p.id, name: p.name, path: p.path, method: p.method, headers: p.headers })
      grouped[p.category] = list
    }
    res.json({ probes: grouped, total: PROBES.length })
  })

  router.post("/detect-framework", async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, only } = req.body as { url?: string; only?: string[] }

      if (!url) {
        res.status(400).json({ error: "URL is required" })
        return
      }

      let baseUrl: string
      try {
        const parsed = new URL(url.startsWith("http") ? url : `https://${url}`)
        baseUrl = parsed.origin
      } catch {
        res.status(400).json({ error: "Invalid URL" })
        return
      }

      const startMs = Date.now()
      console.log(
        `[${new Date().toISOString()}] detect-framework ${baseUrl}${only ? ` (only: ${only.join(",")})` : ""}`,
      )

      let rootHeaders: Headers | null = null
      let rootStatus: number | null = null
      try {
        const rootResp = await fetch(baseUrl, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(DETECT_TIMEOUT_MS),
          headers: { "User-Agent": "Mozilla/5.0 (compatible; AliveBot/1.0)" },
        })
        rootHeaders = rootResp.headers
        rootStatus = rootResp.status
      } catch {
        // Root failed — path probes can still work
      }

      const activeProbes = only ? PROBES.filter(p => only.includes(p.id) || only.includes(p.category)) : PROBES

      const results = await Promise.all(activeProbes.map(probe => runProbe(baseUrl, probe, rootHeaders)))

      const detected = new Map<string, ProbeResult>()
      for (const r of results) {
        if (!r.matched) continue
        const existing = detected.get(r.name)
        if (!existing || (r.evidence && r.evidence.length > (existing.evidence?.length ?? 0))) {
          detected.set(r.name, r)
        }
      }

      const durationMs = Date.now() - startMs
      res.json({
        success: true,
        url: baseUrl,
        rootStatus,
        detected: [...detected.values()].map(({ id, name, category, evidence }) => ({ id, name, category, evidence })),
        allProbes: results,
        durationMs,
      })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] detect-framework error:`, error)
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      })
    }
  })
}
