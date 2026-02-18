import { execSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { withSentryConfig } from "@sentry/nextjs"

/**
 * NOTE: Environment validation happens in the app itself via:
 * - apps/web/app/layout.tsx (imports @webalive/env)
 * - apps/web/lib/env-validation.ts (can be imported in API routes)
 *
 * This ensures validation runs during build AND runtime.
 * Cannot import TS files here since next.config.js runs in Node before transpilation.
 */

// Generate build info file at build time
function writeBuildInfo() {
  try {
    const commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim()
    const branch = execSync("git branch --show-current", { encoding: "utf-8" }).trim()
    const buildTime = new Date().toISOString()
    const buildInfo = { commit, branch, buildTime }

    // Use __dirname equivalent for CommonJS context
    // next.config.js runs in Node.js, so use __filename with path resolution
    const configDir = path.dirname(new URL(import.meta.url).pathname)
    const targetPath = path.join(configDir, "lib", "build-info.json")

    fs.writeFileSync(targetPath, JSON.stringify(buildInfo, null, 2))
  } catch (error) {
    // Log errors but don't fail the build
    // build-info.json is optional and will fall back to "unknown" values
    if (process.env.DEBUG_BUILD_INFO) {
      console.warn(
        "[build-info] Error writing build-info.json:",
        error instanceof Error ? error.message : String(error),
      )
    }
  }
}

writeBuildInfo()

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Separate distDir for test server to avoid conflicts with dev server
  // Tests use ".next-test", dev/prod use ".next"
  distDir: process.env.PLAYWRIGHT_TEST ? ".next-test" : ".next",
  output: "standalone",
  devIndicators: false,
  // Required for PostHog proxy rewrites to work correctly
  skipTrailingSlashRedirect: true,
  // Proxy analytics/monitoring through our domain to bypass ad blockers
  async rewrites() {
    const rewrites = []
    const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST
    if (posthogHost) {
      rewrites.push(
        { source: "/ingest/static/:path*", destination: `${posthogHost}/static/:path*` },
        { source: "/ingest/:path*", destination: `${posthogHost}/:path*` },
      )
    }
    // Sentry uses a tunnel API route (not a rewrite) — see app/api/monitoring/route.ts
    return rewrites
  },
  // Skip type checking during build (run separately with tsc)
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === "true",
  },
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  // Turbopack: Set root to monorepo root for proper package resolution
  turbopack: {
    root: path.join(import.meta.dirname, "../../"),
  },
  // Monorepo: trace from project root (two directories up)
  outputFileTracingRoot: path.join(import.meta.dirname, "../../"),
  outputFileTracingIncludes: {
    "/api/claude/stream/route": [
      "../../packages/tools/**/*",
      "../../packages/images/**/*",
      "../../packages/guides/**/*",
      "../../packages/site-controller/**/*",
      "../../packages/worker-pool/**/*",
      "../../packages/shared/**/*",
      "../../packages/database/**/*",
      // packages/tools dependencies (used in child process, not auto-traced)
      "../../node_modules/@anthropic-ai/**/*",
      "../../node_modules/groq-sdk/**/*",
      "../../node_modules/zod/**/*",
    ],
  },
  serverExternalPackages: ["@napi-rs/image", "@webalive/site-controller", "@webalive/oauth-core"],
  transpilePackages: [
    "@webalive/guides",
    "@webalive/images",
    "@webalive/tools",
    "@webalive/shared",
    "@webalive/env",
    "@webalive/worker-pool",
    "@webalive/database",
  ],
}
export default withSentryConfig(nextConfig, {
  // Suppress noisy source map upload logs
  silent: true,

  // Don't upload source maps to Sentry (self-hosted, not needed)
  sourcemaps: { disable: true },

  // Don't widen the tracing for build-time (keeps builds fast)
  webpack: { treeshake: { removeDebugLogging: true } },

  // Use the org/project from our self-hosted Sentry
  org: "sentry",
  project: "alive",

  // Self-hosted Sentry URL
  sentryUrl: "https://sentry.sonno.tech",
})
