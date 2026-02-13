#!/usr/bin/env bun

// Template configuration generator
// Usage: bun run generate-config.js <domain> <port>

const fs = require("node:fs")
const path = require("node:path")
const { parse } = require("tldts")

const [domain, port, targetDir] = process.argv.slice(2)

// Determine working directory
const workDir = targetDir || process.cwd()
console.log(`Working in: ${workDir}`)

// Validation
if (!domain || !port) {
  console.error("Usage: bun run generate-config.js <domain> <port> [target-dir]")
  process.exit(1)
}

if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
  console.error(`Invalid domain format: ${domain}`)
  process.exit(1)
}

const portNum = Number.parseInt(port)
if (Number.isNaN(portNum) || portNum < 1024 || portNum > 65535) {
  console.error(`Invalid port: ${port} (must be 1024-65535)`)
  process.exit(1)
}

const safeName = domain.replace(/\./g, "-")
const packageName = domain.replace(/\./g, "_")

// Compute registrable domain (eTLD+1) for allowedHosts
// Use allowPrivateDomains to correctly handle domains like github.io, blogspot.com
const registrableDomain = parse(domain, { allowPrivateDomains: true }).domain ?? domain

// Platform wildcard domains (alive.best, sonno.tech, goalive.nl) must NEVER appear
// as allowedHosts wildcards — that would let any tenant's subdomain access another
// tenant's Vite server. Only custom domains get the wildcard (e.g. .example.com for www).
const serverConfigPath = path.join(workDir, "..", "..", "..", "server-config.json")
let platformDomains = ["alive.best", "sonno.tech", "goalive.nl"]
try {
  const serverConfig = JSON.parse(fs.readFileSync("/var/lib/alive/server-config.json", "utf8"))
  if (serverConfig.domains?.wildcard) {
    platformDomains = [...new Set([...platformDomains, serverConfig.domains.wildcard])]
  }
} catch {}

const isPlatformSubdomain = platformDomains.includes(registrableDomain)
const allowedHosts = isPlatformSubdomain ? [domain] : [domain, `.${registrableDomain}`]

// Generate vite.config.ts — with dynamic PORT and /api proxy
const viteConfig = `import path from "node:path";
import react from "@vitejs/plugin-react-swc";
import { aliveTagger } from "@alive-game/alive-tagger";
import { defineConfig } from "vite";

// In dev: Vite is the main server on PORT, API runs on internal port (PORT+1000)
const PORT = Number(process.env.PORT) || ${portNum};
const API_PORT = PORT + 1000;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
	server: {
		host: "::",
		port: PORT,
		allowedHosts: ${JSON.stringify(allowedHosts)},
		hmr: {
			// For reverse proxy (Caddy) with HTTPS
			protocol: "wss",
			clientPort: 443,
		},
		proxy: {
			"/api": {
				target: \`http://localhost:\${API_PORT}\`,
				changeOrigin: true,
			},
		},
	},
	preview: {
		host: "::",
		port: PORT,
		allowedHosts: ${JSON.stringify(allowedHosts)},
	},
	plugins: [react(), mode === "development" && aliveTagger()].filter(
		Boolean,
	),
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
}));
`

// Validate directories exist
const userDir = path.join(workDir, "user")
if (!fs.existsSync(userDir)) {
  console.error(`user directory not found at: ${userDir}`)
  process.exit(1)
}

// Update package.json name
const packageJsonPath = path.join(userDir, "package.json")
if (fs.existsSync(packageJsonPath)) {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
    packageJson.name = packageName
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))
    console.log(`Updated package.json name to: ${packageName}`)
  } catch (error) {
    console.error(`Failed to update package.json: ${error.message}`)
    process.exit(1)
  }
} else {
  console.warn("package.json not found, skipping update")
}

// Write vite.config.ts
const viteConfigPath = path.join(userDir, "vite.config.ts")
try {
  fs.writeFileSync(viteConfigPath, viteConfig)
  console.log(`Generated vite.config.ts for ${domain}:${portNum} (allowedHosts: ${JSON.stringify(allowedHosts)})`)
} catch (error) {
  console.error(`Failed to write vite.config.ts: ${error.message}`)
  process.exit(1)
}

console.log(`Configuration generated for ${domain} on port ${portNum}`)
