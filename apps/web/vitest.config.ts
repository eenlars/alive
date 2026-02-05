import { readFileSync } from "node:fs"
import { join } from "node:path"
import tsconfigPaths from "vite-tsconfig-paths"
import { defineConfig, type Plugin, type ViteUserConfig } from "vitest/config"

// Load .env file manually for tests
function loadEnvFile() {
  try {
    const envPath = join(process.cwd(), ".env")
    const envContent = readFileSync(envPath, "utf-8")
    const envVars: Record<string, string> = {}

    for (const line of envContent.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue

      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const [, key, value] = match
        // Remove quotes if present
        envVars[key.trim()] = value.trim().replace(/^["']|["']$/g, "")
      }
    }

    return envVars
  } catch {
    return {}
  }
}

export const sharedConfig = {
  plugins: [tsconfigPaths() as Plugin],
  resolve: {
    preserveSymlinks: false,
    // Use development builds for testing (required for React act() and testing-library)
    conditions: ["development", "browser"],
    alias: {
      // Point to source, not dist - let TypeScript handle compilation
      "@webalive/tools/display": join(process.cwd(), "../../packages/tools/src/display.ts"),
      "@webalive/tools": join(process.cwd(), "../../packages/tools/src/index.ts"),
      "@webalive/site-controller": join(process.cwd(), "../../packages/site-controller"),
      "@webalive/images": join(process.cwd(), "../../packages/images"),
      "@webalive/template": join(process.cwd(), "../../packages/template"),
      "@webalive/guides": join(process.cwd(), "../../packages/guides"),
      // Ensure single React copy for DOM testing environments (prevents "Invalid hook call" errors)
      // All workspace packages now use React 19
      react: join(process.cwd(), "../../node_modules/react"),
      "react-dom": join(process.cwd(), "../../node_modules/react-dom"),
      "react/jsx-dev-runtime": join(process.cwd(), "../../node_modules/react/jsx-dev-runtime.js"),
      "react/jsx-runtime": join(process.cwd(), "../../node_modules/react/jsx-runtime.js"),
    },
  },
  // Dedupe React to prevent multiple copies
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  ssr: {
    noExternal: [
      "@webalive/tools",
      "@webalive/site-controller",
      "@webalive/images",
      "@webalive/template",
      "@webalive/guides",
      // Process React in SSR for proper jsdom integration
      "react",
      "react-dom",
    ],
  },
} satisfies ViteUserConfig

export const baseTestConfig = {
  globals: true,
  setupFiles: ["./tests/setup.ts"],
  env: {
    ...loadEnvFile(),
    BRIDGE_ENV: "local",
  },
  exclude: [
    "**/node_modules/**",
    "**/dist/**",
    "**/e2e-tests/**",
    "**/.next/**",
    "**/*.spec.{ts,tsx}",
    "**/lib/__tests__/claude-tool-permissions.test.ts",
    // TODO: Fix react/jsx-dev-runtime resolution in vitest 4.x with happy-dom
    "**/components/ui/__tests__/PhotoMenu.test.tsx",
    "**/features/chat/hooks/__tests__/useStreamCancellation.test.ts",
    "**/lib/db/__tests__/useTabMessages.test.ts",
  ],
  // Use forks instead of threads - native modules (@napi-rs/image) hang with threads
  pool: "forks" as const,
  // Match Vitest 4+ pool semantics for "single fork" stability.
  maxWorkers: 1,
  // Timeouts
  testTimeout: 10000,
  hookTimeout: 10000,
}

export const dbIntegrationGlobs = [
  "lib/credits/__tests__/**/*.integration.test.ts",
  "lib/credits/__tests__/credit-system-supabase.test.ts",
  "lib/__tests__/credit-system-supabase.test.ts",
  "lib/deployment/__tests__/org-resolver.test.ts",
  "lib/deployment/__tests__/user-quotas.test.ts",
  "features/auth/lib/__tests__/rls-integration.test.ts",
]

export const systemGlobs = [
  "features/deployment/__tests__/**/*.test.ts",
  "lib/__tests__/install-package-e2e.test.ts",
  "app/api/login-manager/__tests__/security.test.ts",
]

export default defineConfig({
  ...sharedConfig,
  test: {
    ...baseTestConfig,
    // Vitest 4.x: Use 'node' environment by default for Node.js built-ins (AsyncLocalStorage)
    // Tests that need DOM can use: // @vitest-environment happy-dom
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: [...baseTestConfig.exclude, ...dbIntegrationGlobs, ...systemGlobs],
  },
})
