#!/usr/bin/env bun
/**
 * Migration Script: Add/Update previewNavSync plugin in vite.config.ts
 *
 * This script adds the preview navigation sync plugin to all site vite configs.
 * It handles both:
 * - Sites WITHOUT the plugin (adds it)
 * - Sites WITH the OLD plugin (updates to new version with sendStart)
 *
 * Usage:
 *   bun scripts/migrate-vite-preview-nav.ts --dry-run          # Preview changes
 *   bun scripts/migrate-vite-preview-nav.ts --dry-run --limit 3 # Preview first 3
 *   bun scripts/migrate-vite-preview-nav.ts                     # Apply changes
 *
 * The script preserves all site-specific settings (ports, allowedHosts, proxies, etc.)
 */

import { readFileSync, writeFileSync, readdirSync, statSync, lstatSync, existsSync } from "node:fs"
import { join } from "node:path"

// The NEW previewNavSync plugin code (with sendStart for loading state)
const NEW_PREVIEW_NAV_PLUGIN = `// Plugin to inject preview navigation sync script for Alive sandbox
// IMPORTANT: Message types MUST match PREVIEW_MESSAGES in @webalive/shared/constants.ts
// - NAVIGATION_START = "preview-navigation-start"
// - NAVIGATION = "preview-navigation"
function previewNavSync(): Plugin {
  return {
    name: "preview-nav-sync",
    transformIndexHtml(html) {
      const script = \`<script>
(function() {
  if (window.parent === window) return;
  function sendStart() {
    window.parent.postMessage({ type: 'preview-navigation-start' }, '*');
  }
  function sendPath() {
    window.parent.postMessage({ type: 'preview-navigation', path: location.pathname }, '*');
  }
  sendPath();
  var origPush = history.pushState, origReplace = history.replaceState;
  history.pushState = function() { sendStart(); origPush.apply(this, arguments); sendPath(); };
  history.replaceState = function() { sendStart(); origReplace.apply(this, arguments); sendPath(); };
  window.addEventListener('popstate', function() { sendStart(); sendPath(); });
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (a && a.href && !a.target && a.origin === location.origin) sendStart();
  }, true);
  window.addEventListener('beforeunload', sendStart);
})();
</script>\`;
      // Inject at very start of head (before Vite's scripts)
      return html.replace("<head>", \`<head>\${script}\`);
    },
  };
}`

// Regex to match the OLD previewNavSync function (without sendStart)
// Flexible enough to handle tabs/spaces and semicolons
const OLD_PLUGIN_REGEX =
  /\/\/ Plugin to inject preview navigation sync script[^\n]*\n(?:\/\/[^\n]*\n)*function previewNavSync\(\): Plugin \{[\s\S]*?name: "preview-nav-sync"[\s\S]*?return html\.replace[\s\S]*?\}[;\s]*\}/

// Regex to detect if previewNavSync exists at all
const HAS_PLUGIN_REGEX = /function previewNavSync\(\)/

// Regex to detect if it's already the NEW version (has sendStart)
const HAS_NEW_PLUGIN_REGEX = /preview-navigation-start/

// Regex to check if Plugin type is imported
const HAS_PLUGIN_TYPE_IMPORT = /import.*type Plugin.*from ["']vite["']/
const VITE_IMPORT_REGEX = /import \{([^}]*)\} from ["']vite["']/

interface MigrationResult {
  path: string
  status: "added" | "updated" | "skipped" | "error"
  reason?: string
  diff?: string
}

function findViteConfigs(sitesDir: string): string[] {
  const configs: string[] = []

  try {
    const entries = readdirSync(sitesDir)
    for (const entry of entries) {
      const sitePath = join(sitesDir, entry)

      // Skip symlinks - use lstatSync to check without following
      try {
        const lstat = lstatSync(sitePath)
        if (lstat.isSymbolicLink()) {
          continue
        }
        if (!lstat.isDirectory()) {
          continue
        }
      } catch {
        continue
      }

      // Check for vite.config.ts in user directory
      const viteConfig = join(sitePath, "user", "vite.config.ts")
      if (existsSync(viteConfig)) {
        configs.push(viteConfig)
      }
    }
  } catch (err) {
    console.error(`Error reading sites directory: ${err}`)
  }

  return configs.sort()
}

function migrateConfig(configPath: string, dryRun: boolean): MigrationResult {
  try {
    const original = readFileSync(configPath, "utf-8")
    let modified = original

    // Check if already has the NEW version
    if (HAS_NEW_PLUGIN_REGEX.test(original)) {
      return {
        path: configPath,
        status: "skipped",
        reason: "Already has new previewNavSync with sendStart",
      }
    }

    // Check if has the OLD version (needs update)
    if (HAS_PLUGIN_REGEX.test(original)) {
      // Replace old plugin with new
      modified = original.replace(OLD_PLUGIN_REGEX, NEW_PREVIEW_NAV_PLUGIN)

      if (modified === original) {
        return {
          path: configPath,
          status: "error",
          reason: "Has previewNavSync but couldn't match pattern for replacement",
        }
      }

      if (!dryRun) {
        writeFileSync(configPath, modified)
      }

      return {
        path: configPath,
        status: "updated",
        reason: "Updated old previewNavSync to new version with sendStart",
        diff: generateDiff(original, modified),
      }
    }

    // No plugin exists - need to add it
    // Step 1: Ensure Plugin type is imported from vite
    if (!HAS_PLUGIN_TYPE_IMPORT.test(modified)) {
      const viteImportMatch = modified.match(VITE_IMPORT_REGEX)
      if (viteImportMatch) {
        // Add 'type Plugin' to existing vite import
        const existingImports = viteImportMatch[1]
        if (!existingImports.includes("Plugin")) {
          const newImports = existingImports.trim() + ", type Plugin"
          modified = modified.replace(VITE_IMPORT_REGEX, `import {${newImports}} from "vite"`)
        }
      } else {
        // No vite import at all - add one after the last import
        const lastImportMatch = modified.match(/^import .+$/gm)
        if (lastImportMatch) {
          const lastImport = lastImportMatch[lastImportMatch.length - 1]
          modified = modified.replace(lastImport, `${lastImport}\nimport { type Plugin } from "vite"`)
        }
      }
    }

    // Step 2: Add the plugin function before defineConfig
    const defineConfigMatch = modified.match(/\/\/ https:\/\/vitejs\.dev\/config\/\s*\nexport default defineConfig/)
    if (defineConfigMatch) {
      modified = modified.replace(defineConfigMatch[0], `${NEW_PREVIEW_NAV_PLUGIN}\n\n${defineConfigMatch[0]}`)
    } else {
      // Try alternative pattern
      const altMatch = modified.match(/export default defineConfig/)
      if (altMatch) {
        modified = modified.replace(altMatch[0], `${NEW_PREVIEW_NAV_PLUGIN}\n\n${altMatch[0]}`)
      } else {
        return {
          path: configPath,
          status: "error",
          reason: "Couldn't find defineConfig to insert plugin before",
        }
      }
    }

    // Step 3: Add previewNavSync() to plugins array (or create one)
    const pluginsMatch = modified.match(/plugins:\s*\[/)
    if (pluginsMatch) {
      modified = modified.replace(/plugins:\s*\[/, "plugins: [previewNavSync(), ")
    } else {
      // No plugins array - need to add one before closing of defineConfig
      // Find the last property before the closing }))
      const defineConfigPattern = /export default defineConfig\(\{([\s\S]*?)\}\)/
      const configMatch = modified.match(defineConfigPattern)
      if (configMatch) {
        const configContent = configMatch[1]
        // Add plugins at the end of config
        const newConfigContent = configContent.trimEnd() + ",\n  plugins: [previewNavSync()],\n"
        modified = modified.replace(defineConfigPattern, `export default defineConfig({${newConfigContent}})`)
      } else {
        // Try with mode parameter
        const defineConfigModePattern = /export default defineConfig\(\(\{ mode \}\) => \(\{([\s\S]*?)\}\)\)/
        const modeMatch = modified.match(defineConfigModePattern)
        if (modeMatch) {
          const configContent = modeMatch[1]
          const newConfigContent = configContent.trimEnd() + ",\n  plugins: [previewNavSync()],\n"
          modified = modified.replace(
            defineConfigModePattern,
            `export default defineConfig(({ mode }) => ({${newConfigContent}}))`,
          )
        } else {
          return {
            path: configPath,
            status: "error",
            reason: "Couldn't find plugins array or defineConfig to add previewNavSync()",
          }
        }
      }
    }

    if (!dryRun) {
      writeFileSync(configPath, modified)
    }

    return {
      path: configPath,
      status: "added",
      reason: "Added new previewNavSync plugin",
      diff: generateDiff(original, modified),
    }
  } catch (err) {
    return {
      path: configPath,
      status: "error",
      reason: `Error: ${err}`,
    }
  }
}

function generateDiff(original: string, modified: string): string {
  const origLines = original.split("\n")
  const modLines = modified.split("\n")

  const diff: string[] = []
  let inDiff = false
  let contextBefore: string[] = []

  for (let i = 0; i < Math.max(origLines.length, modLines.length); i++) {
    const origLine = origLines[i] ?? ""
    const modLine = modLines[i] ?? ""

    if (origLine !== modLine) {
      // Show context before
      if (!inDiff && contextBefore.length > 0) {
        diff.push("...")
        for (const line of contextBefore.slice(-2)) {
          diff.push(`  ${line}`)
        }
      }
      inDiff = true

      if (origLine && !modLine) {
        diff.push(`- ${origLine}`)
      } else if (!origLine && modLine) {
        diff.push(`+ ${modLine}`)
      } else {
        diff.push(`- ${origLine}`)
        diff.push(`+ ${modLine}`)
      }
    } else if (inDiff) {
      // Show some context after diff
      diff.push(`  ${origLine}`)
      if (diff.filter(l => l.startsWith("  ")).length >= 2) {
        inDiff = false
        contextBefore = []
      }
    } else {
      contextBefore.push(origLine)
      if (contextBefore.length > 3) contextBefore.shift()
    }
  }

  // Truncate if too long
  if (diff.length > 60) {
    return diff.slice(0, 30).join("\n") + "\n... (truncated) ...\n" + diff.slice(-10).join("\n")
  }

  return diff.join("\n")
}

// Main
const args = process.argv.slice(2)
const dryRun = args.includes("--dry-run")
const limitArg = args.find(a => a.startsWith("--limit"))
const limit = limitArg ? parseInt(args[args.indexOf(limitArg) + 1] || "0") : 0

const SITES_DIR = "/srv/webalive/sites"

console.log(`\n${"=".repeat(60)}`)
console.log(`Preview Navigation Migration Script`)
console.log(`${"=".repeat(60)}`)
console.log(`Mode: ${dryRun ? "DRY RUN (no changes will be made)" : "LIVE (changes will be applied)"}`)
if (limit) console.log(`Limit: ${limit} sites`)
console.log(`${"=".repeat(60)}\n`)

let configs = findViteConfigs(SITES_DIR)
console.log(`Found ${configs.length} vite.config.ts files\n`)

if (limit) {
  configs = configs.slice(0, limit)
  console.log(`Processing first ${limit} configs...\n`)
}

const results: MigrationResult[] = []

for (const config of configs) {
  const result = migrateConfig(config, dryRun)
  results.push(result)

  const icon =
    result.status === "added" ? "+" : result.status === "updated" ? "~" : result.status === "skipped" ? "-" : "!"

  console.log(`[${icon}] ${result.path.replace(SITES_DIR + "/", "")}`)
  console.log(`    ${result.status}: ${result.reason}`)

  if (result.diff && (result.status === "added" || result.status === "updated")) {
    console.log(`\n    Diff:`)
    for (const line of result.diff.split("\n").slice(0, 20)) {
      console.log(`    ${line}`)
    }
    if (result.diff.split("\n").length > 20) {
      console.log(`    ... (${result.diff.split("\n").length - 20} more lines)`)
    }
    console.log()
  }
  console.log()
}

// Summary
console.log(`\n${"=".repeat(60)}`)
console.log(`Summary`)
console.log(`${"=".repeat(60)}`)
console.log(`Added:   ${results.filter(r => r.status === "added").length}`)
console.log(`Updated: ${results.filter(r => r.status === "updated").length}`)
console.log(`Skipped: ${results.filter(r => r.status === "skipped").length}`)
console.log(`Errors:  ${results.filter(r => r.status === "error").length}`)
console.log(`Total:   ${results.length}`)

if (dryRun) {
  console.log(`\nThis was a DRY RUN. No files were modified.`)
  console.log(`Run without --dry-run to apply changes.`)
}

if (results.some(r => r.status === "error")) {
  console.log(`\nErrors:`)
  for (const r of results.filter(r => r.status === "error")) {
    console.log(`  - ${r.path}: ${r.reason}`)
  }
}
