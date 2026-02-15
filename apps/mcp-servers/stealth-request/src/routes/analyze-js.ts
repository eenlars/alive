import type { Request, Response, Router } from "express"

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
}

const JS_FETCH_TIMEOUT_MS = 15_000
const JS_MAX_SIZE = 5 * 1024 * 1024 // 5MB per file
const JS_CONCURRENCY = 6

type JsAnalysis = {
  url: string
  size: number
  apiEndpoints: string[]
  envVars: Array<{ name: string; value?: string }>
  sourceMaps: string[]
  versions: Array<{ lib: string; version: string }>
  secrets: Array<{ type: string; value: string; context: string }>
  graphql: string[]
  internalPaths: string[]
}

const PATTERNS = {
  apiAbsolute: /https?:\/\/[^\s"'`\\)}\]>]+\/(?:api|v[1-9]|graphql|rest|rpc|_next\/data)[^\s"'`\\)}\]>]*/gi,
  apiRelative: /["'`](\/(?:api|v[1-9]|graphql|rest|rpc|_next\/data)\/[^\s"'`\\)}\]>]*?)["'`]/gi,

  envNext: /NEXT_PUBLIC_([A-Z_][A-Z0-9_]*)/g,
  envVite: /VITE_([A-Z_][A-Z0-9_]*)/g,
  envReact: /REACT_APP_([A-Z_][A-Z0-9_]*)/g,
  envProcess: /process\.env\.([A-Z_][A-Z0-9_]{2,})/g,
  envImportMeta: /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  envWithValue: /(?:NEXT_PUBLIC_|VITE_|REACT_APP_)([A-Z0-9_]+)["':\s]+["']([^"']{1,200})["']/g,

  sourceMap: /\/\/[#@]\s*sourceMappingURL=([^\s]+)/g,
  sourceMapFile: /["'`]([^"'`\s]+\.map)["'`]/g,

  versionString: /["'](\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?)["']/g,

  awsAccessKey: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g,
  googleApiKey: /AIza[0-9A-Za-z_-]{35}/g,
  stripePublishable: /pk_(?:live|test)_[a-zA-Z0-9]{24,}/g,
  stripeSecret: /sk_(?:live|test)_[a-zA-Z0-9]{24,}/g,
  firebaseConfig:
    /(?:apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)["':\s]+["']([^"']{5,})["']/g,
  genericToken: /(?:token|apikey|api_key|secret|password|credential)["':\s]+["']([a-zA-Z0-9_\-/.]{20,})["']/gi,
  s3Bucket: /[a-z0-9.-]+\.s3(?:\.[a-z0-9-]+)?\.amazonaws\.com/gi,
  jwt: /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,

  graphqlOp: /(?:query|mutation|subscription)\s+([A-Z][a-zA-Z0-9_]*)/g,
  graphqlEndpoint: /["'`](\/graphql[^\s"'`]*)["'`]/gi,

  internalPath:
    /["'`]((?:\/src|\/app|\/pages|\/components|\/lib|\/utils|\/services|\/hooks|\/features|\/modules)\/[^\s"'`]{3,80})["'`]/g,
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)]
}

function getContext(source: string, match: string, chars: number = 40): string {
  const idx = source.indexOf(match)
  if (idx === -1) return ""
  const start = Math.max(0, idx - chars)
  const end = Math.min(source.length, idx + match.length + chars)
  return source.slice(start, end).replace(/\s+/g, " ").trim()
}

function analyzeJsSource(source: string, url: string): JsAnalysis {
  const result: JsAnalysis = {
    url,
    size: source.length,
    apiEndpoints: [],
    envVars: [],
    sourceMaps: [],
    versions: [],
    secrets: [],
    graphql: [],
    internalPaths: [],
  }

  // API endpoints
  const apis = new Set<string>()
  for (const m of source.matchAll(PATTERNS.apiAbsolute)) apis.add(m[0])
  for (const m of source.matchAll(PATTERNS.apiRelative)) {
    if (m[1]) apis.add(m[1])
  }
  result.apiEndpoints = [...apis]

  // Env vars
  const envMap = new Map<string, string | undefined>()
  for (const m of source.matchAll(PATTERNS.envWithValue)) {
    if (m[1]) envMap.set(m[1], m[2])
  }
  for (const p of [
    PATTERNS.envNext,
    PATTERNS.envVite,
    PATTERNS.envReact,
    PATTERNS.envProcess,
    PATTERNS.envImportMeta,
  ]) {
    for (const m of source.matchAll(p)) {
      if (m[1] && !envMap.has(m[1])) envMap.set(m[1], undefined)
    }
  }
  result.envVars = [...envMap.entries()].map(([name, value]) => (value ? { name, value } : { name }))

  // Source maps
  for (const m of source.matchAll(PATTERNS.sourceMap)) {
    if (m[1]) result.sourceMaps.push(m[1])
  }
  for (const m of source.matchAll(PATTERNS.sourceMapFile)) {
    if (m[1]) result.sourceMaps.push(m[1])
  }
  result.sourceMaps = dedupe(result.sourceMaps)

  // Secrets
  const secrets: Array<{ type: string; value: string; context: string }> = []
  for (const m of source.matchAll(PATTERNS.awsAccessKey))
    secrets.push({ type: "AWS Access Key", value: m[0], context: getContext(source, m[0]) })
  for (const m of source.matchAll(PATTERNS.googleApiKey))
    secrets.push({ type: "Google API Key", value: m[0], context: getContext(source, m[0]) })
  for (const m of source.matchAll(PATTERNS.stripePublishable))
    secrets.push({ type: "Stripe Publishable Key", value: m[0], context: getContext(source, m[0]) })
  for (const m of source.matchAll(PATTERNS.stripeSecret))
    secrets.push({ type: "Stripe Secret Key", value: m[0], context: getContext(source, m[0]) })
  for (const m of source.matchAll(PATTERNS.s3Bucket))
    secrets.push({ type: "S3 Bucket", value: m[0], context: getContext(source, m[0]) })
  for (const m of source.matchAll(PATTERNS.jwt))
    secrets.push({ type: "JWT Token", value: `${m[0].slice(0, 50)}...`, context: "" })
  for (const m of source.matchAll(PATTERNS.firebaseConfig)) {
    if (m[1]) secrets.push({ type: "Firebase Config", value: m[1], context: getContext(source, m[0]) })
  }
  for (const m of source.matchAll(PATTERNS.genericToken)) {
    const val = m[1]
    if (val && val.length >= 20 && !val.includes("/") && !val.includes(".css") && !val.match(/^[0-9.]+$/)) {
      secrets.push({ type: "Generic Token/Key", value: val, context: getContext(source, m[0]) })
    }
  }
  const seenSecrets = new Set<string>()
  result.secrets = secrets.filter(s => {
    if (seenSecrets.has(s.value)) return false
    seenSecrets.add(s.value)
    return true
  })

  // GraphQL
  for (const m of source.matchAll(PATTERNS.graphqlOp)) {
    if (m[1]) result.graphql.push(m[1])
  }
  for (const m of source.matchAll(PATTERNS.graphqlEndpoint)) {
    if (m[1]) result.graphql.push(m[1])
  }
  result.graphql = dedupe(result.graphql)

  // Internal paths
  for (const m of source.matchAll(PATTERNS.internalPath)) {
    if (m[1]) result.internalPaths.push(m[1])
  }
  result.internalPaths = dedupe(result.internalPaths).slice(0, 50)

  // Versions
  const knownLibs = [
    "react",
    "next",
    "nuxt",
    "vue",
    "angular",
    "svelte",
    "webpack",
    "vite",
    "tailwind",
    "typescript",
    "node",
    "express",
    "hono",
    "jquery",
    "lodash",
    "axios",
    "sentry",
    "stripe",
    "firebase",
  ]
  const versionCtx = new Map<string, string>()
  for (const m of source.matchAll(PATTERNS.versionString)) {
    const ver = m[1]
    if (!ver) continue
    const ctx = getContext(source, m[0], 60).toLowerCase()
    for (const lib of knownLibs) {
      if (ctx.includes(lib) && !versionCtx.has(lib)) {
        versionCtx.set(lib, ver)
      }
    }
  }
  result.versions = [...versionCtx.entries()].map(([lib, version]) => ({ lib, version }))

  return result
}

function extractScriptUrls(html: string, baseUrl: string): string[] {
  const urls = new Set<string>()
  const srcRegex = /<script[^>]+src=["']([^"']+)["']/gi
  for (const m of html.matchAll(srcRegex)) {
    if (!m[1]) continue
    try {
      urls.add(new URL(m[1], baseUrl).href)
    } catch {
      /* invalid URL */
    }
  }
  const preloadRegex = /<link[^>]+rel=["']modulepreload["'][^>]+href=["']([^"']+)["']/gi
  for (const m of html.matchAll(preloadRegex)) {
    if (!m[1]) continue
    try {
      urls.add(new URL(m[1], baseUrl).href)
    } catch {
      /* invalid URL */
    }
  }
  return [...urls].filter(u => u.endsWith(".js") || u.endsWith(".mjs") || u.includes(".js?"))
}

async function fetchJsBundle(url: string): Promise<{ url: string; source: string } | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(JS_FETCH_TIMEOUT_MS),
      headers: BROWSER_HEADERS,
    })
    if (!resp.ok) return null
    const contentLength = resp.headers.get("content-length")
    if (contentLength && parseInt(contentLength, 10) > JS_MAX_SIZE) return null
    const source = await resp.text()
    if (source.length > JS_MAX_SIZE) return null
    return { url, source }
  } catch {
    return null
  }
}

export function registerAnalyzeJsRoutes(router: Router): void {
  router.post("/analyze-js", async (req: Request, res: Response): Promise<void> => {
    try {
      const { url, html: providedHtml } = req.body as { url?: string; html?: string }
      if (!url) {
        res.status(400).json({ error: "url is required" })
        return
      }

      const startMs = Date.now()
      console.log(`[${new Date().toISOString()}] analyze-js ${url}`)

      let html: string
      let baseUrl: string
      if (providedHtml) {
        html = providedHtml
        baseUrl = url
      } else {
        const resp = await fetch(url, {
          signal: AbortSignal.timeout(JS_FETCH_TIMEOUT_MS),
          headers: BROWSER_HEADERS,
          redirect: "follow",
        })
        if (!resp.ok) {
          res.status(502).json({
            success: false,
            error: `Failed to fetch page: ${resp.status} ${resp.statusText}. If Cloudflare-blocked, use /fetch first and pass the HTML via the 'html' param.`,
          })
          return
        }
        html = await resp.text()
        baseUrl = resp.url
      }

      const scriptUrls = extractScriptUrls(html, baseUrl)

      const inlineScripts: string[] = []
      const inlineRegex = /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi
      for (const m of html.matchAll(inlineRegex)) {
        if (m[1] && m[1].trim().length > 20) {
          inlineScripts.push(m[1])
        }
      }

      const bundles: Array<{ url: string; source: string }> = []
      for (let i = 0; i < scriptUrls.length; i += JS_CONCURRENCY) {
        const chunk = scriptUrls.slice(i, i + JS_CONCURRENCY)
        const results = await Promise.allSettled(chunk.map(u => fetchJsBundle(u)))
        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            bundles.push(r.value)
          }
        }
      }

      const analyses: JsAnalysis[] = []
      for (const bundle of bundles) {
        analyses.push(analyzeJsSource(bundle.source, bundle.url))
      }
      if (inlineScripts.length > 0) {
        const combined = inlineScripts.join("\n")
        analyses.push(analyzeJsSource(combined, `${baseUrl} (inline)`))
      }

      // Aggregate
      const allApis = dedupe(analyses.flatMap(a => a.apiEndpoints))
      const allEnvMap = new Map<string, string | undefined>()
      for (const a of analyses) {
        for (const e of a.envVars) {
          if (!allEnvMap.has(e.name) || (e.value && !allEnvMap.get(e.name))) {
            allEnvMap.set(e.name, e.value)
          }
        }
      }
      const allSourceMaps = dedupe(analyses.flatMap(a => a.sourceMaps))
      const allSecrets = analyses.flatMap(a => a.secrets)
      const seenSecretValues = new Set<string>()
      const dedupedSecrets = allSecrets.filter(s => {
        if (seenSecretValues.has(s.value)) return false
        seenSecretValues.add(s.value)
        return true
      })
      const allGraphql = dedupe(analyses.flatMap(a => a.graphql))
      const allPaths = dedupe(analyses.flatMap(a => a.internalPaths)).slice(0, 100)

      const versionMap = new Map<string, string>()
      for (const a of analyses) {
        for (const v of a.versions) {
          if (!versionMap.has(v.lib)) versionMap.set(v.lib, v.version)
        }
      }

      const durationMs = Date.now() - startMs

      res.json({
        success: true,
        url: baseUrl,
        scriptsFound: scriptUrls.length,
        scriptsAnalyzed: bundles.length,
        inlineScripts: inlineScripts.length,
        totalJsSize: bundles.reduce((sum, b) => sum + b.source.length, 0),
        summary: {
          apiEndpoints: allApis,
          envVars: [...allEnvMap.entries()].map(([name, value]) => (value ? { name, value } : { name })),
          versions: [...versionMap.entries()].map(([lib, version]) => ({ lib, version })),
          sourceMaps: allSourceMaps,
          secrets: dedupedSecrets,
          graphql: allGraphql,
          internalPaths: allPaths,
        },
        perBundle: analyses.map(a => ({
          url: a.url,
          size: a.size,
          apiEndpoints: a.apiEndpoints.length,
          envVars: a.envVars.length,
          secrets: a.secrets.length,
          sourceMaps: a.sourceMaps.length,
        })),
        durationMs,
      })
    } catch (error) {
      console.error(`[${new Date().toISOString()}] analyze-js error:`, error)
      res.status(500).json({ success: false, error: error instanceof Error ? error.message : "Unknown error" })
    }
  })
}
