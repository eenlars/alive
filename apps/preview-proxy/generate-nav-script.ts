/**
 * Generates nav_script_gen.go from @webalive/shared PREVIEW_MESSAGES constants.
 *
 * This is the single source of truth for postMessage types used in the
 * navigation sync script injected by the Go preview-proxy. Without this,
 * the Go string constant can silently drift from the TypeScript constants,
 * causing the preview loading overlay to never dismiss.
 *
 * Run: bun apps/preview-proxy/generate-nav-script.ts
 * Called automatically by: bun run --cwd apps/preview-proxy generate
 */

// Import directly from constants source to avoid triggering server config loading
// via the @webalive/shared barrel export.
import { PREVIEW_MESSAGES } from "../../packages/shared/src/constants"
import { readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"

// ─── Validation ───────────────────────────────────────────────────────────────

// 1. Verify PREVIEW_MESSAGES exists and has the expected shape
if (!PREVIEW_MESSAGES || typeof PREVIEW_MESSAGES !== "object") {
  throw new Error("[generate-nav-script] FATAL: PREVIEW_MESSAGES is not an object. Check @webalive/shared constants.")
}

const NAV = PREVIEW_MESSAGES.NAVIGATION
const NAV_START = PREVIEW_MESSAGES.NAVIGATION_START

// 2. Verify both constants are defined and non-empty strings
if (typeof NAV !== "string" || NAV.length === 0) {
  throw new Error(
    `[generate-nav-script] FATAL: PREVIEW_MESSAGES.NAVIGATION is not a non-empty string. Got: ${JSON.stringify(NAV)}`,
  )
}
if (typeof NAV_START !== "string" || NAV_START.length === 0) {
  throw new Error(
    `[generate-nav-script] FATAL: PREVIEW_MESSAGES.NAVIGATION_START is not a non-empty string. Got: ${JSON.stringify(NAV_START)}`,
  )
}

// 3. Verify they don't contain characters that would break the JavaScript string
for (const [name, value] of Object.entries({ NAVIGATION: NAV, NAVIGATION_START: NAV_START })) {
  if (/['"\\`${}]/.test(value)) {
    throw new Error(`[generate-nav-script] FATAL: PREVIEW_MESSAGES.${name} contains unsafe characters: "${value}"`)
  }
  if (value !== value.trim()) {
    throw new Error(`[generate-nav-script] FATAL: PREVIEW_MESSAGES.${name} has leading/trailing whitespace: "${value}"`)
  }
  if (!/^[a-z][a-z0-9-]+$/.test(value)) {
    throw new Error(
      `[generate-nav-script] FATAL: PREVIEW_MESSAGES.${name} must be lowercase kebab-case. Got: "${value}"`,
    )
  }
}

// 4. Verify NAV_START starts with NAV (e.g. "preview-navigation" and "preview-navigation-start")
if (!NAV_START.startsWith(NAV)) {
  throw new Error(
    `[generate-nav-script] FATAL: NAVIGATION_START ("${NAV_START}") must start with NAVIGATION ("${NAV}"). ` +
      "This suggests the constants have diverged.",
  )
}

// 5. Cross-check with the legacy Next.js preview-router to ensure consistency
const legacyRouterPath = join(import.meta.dir, "../../apps/web/app/api/preview-router/[[...path]]/route.ts")
try {
  const legacySource = readFileSync(legacyRouterPath, "utf-8")
  if (!legacySource.includes("PREVIEW_MESSAGES.NAVIGATION")) {
    console.warn(
      "[generate-nav-script] WARNING: Legacy preview-router no longer references PREVIEW_MESSAGES.NAVIGATION. " +
        "It may have been removed or refactored.",
    )
  }
  if (!legacySource.includes("PREVIEW_MESSAGES.NAVIGATION_START")) {
    console.warn(
      "[generate-nav-script] WARNING: Legacy preview-router no longer references PREVIEW_MESSAGES.NAVIGATION_START.",
    )
  }
} catch {
  // Legacy router may have been deleted — that's fine
  console.log("[generate-nav-script] Legacy preview-router not found (may have been removed)")
}

// ─── Generation ───────────────────────────────────────────────────────────────

// The script is injected after <head> in HTML responses.
// It must run before any framework JS to capture the initial navigation.
const script = `<script>
(function() {
  if (window.parent === window) return;
  function sendStart() {
    window.parent.postMessage({ type: '${NAV_START}' }, '*');
  }
  function sendPath() {
    window.parent.postMessage({ type: '${NAV}', path: location.pathname }, '*');
  }
  sendPath();
  var origPush = history.pushState, origReplace = history.replaceState;
  history.pushState = function() {
    sendStart();
    origPush.apply(this, arguments);
    sendPath();
  };
  history.replaceState = function() {
    sendStart();
    origReplace.apply(this, arguments);
    sendPath();
  };
  window.addEventListener('popstate', function() { sendStart(); sendPath(); });
  document.addEventListener('click', function(e) {
    var a = e.target.closest('a[href]');
    if (a && a.href && !a.target && a.origin === location.origin) {
      sendStart();
    }
  }, true);
  window.addEventListener('beforeunload', sendStart);
})();
</script>`

// 6. Verify the generated script actually contains the message types
if (!script.includes(`'${NAV}'`)) {
  throw new Error(`[generate-nav-script] FATAL: Generated script does not contain NAVIGATION type '${NAV}'`)
}
if (!script.includes(`'${NAV_START}'`)) {
  throw new Error(`[generate-nav-script] FATAL: Generated script does not contain NAVIGATION_START type '${NAV_START}'`)
}

// 7. Verify the script is valid-ish HTML (has opening and closing script tags)
if (!script.startsWith("<script>") || !script.endsWith("</script>")) {
  throw new Error("[generate-nav-script] FATAL: Generated script is not wrapped in <script> tags")
}

// Escape backticks for Go raw string literal
const escaped = script.replace(/`/g, '` + "`" + `')

const goFile = `// Code generated by generate-nav-script.ts — DO NOT EDIT.
// Source of truth: @webalive/shared PREVIEW_MESSAGES constants.
//
// NAVIGATION = "${NAV}"
// NAVIGATION_START = "${NAV_START}"

package main

// navScript is injected into HTML responses to sync iframe navigation
// with the parent Alive chat UI via postMessage.
const navScript = \`${escaped}\`
`

// ─── Write & Verify ───────────────────────────────────────────────────────────

const outPath = join(import.meta.dir, "nav_script_gen.go")
writeFileSync(outPath, goFile)

// 8. Read back and verify the file was written correctly
const written = readFileSync(outPath, "utf-8")
if (!written.includes(`NAVIGATION = "${NAV}"`)) {
  throw new Error("[generate-nav-script] FATAL: Written file does not contain expected NAVIGATION comment")
}
if (!written.includes("package main")) {
  throw new Error("[generate-nav-script] FATAL: Written file does not contain 'package main'")
}
if (!written.includes("const navScript")) {
  throw new Error("[generate-nav-script] FATAL: Written file does not contain 'const navScript'")
}

// 9. If Go is available, verify the generated file compiles
try {
  execSync("go vet ./...", { cwd: import.meta.dir, stdio: "pipe" })
  console.log("[generate-nav-script] go vet passed")
} catch (e: unknown) {
  const error = e as { stderr?: Buffer }
  throw new Error(`[generate-nav-script] FATAL: Generated Go file fails 'go vet': ${error.stderr?.toString()}`)
}

console.log(`[generate-nav-script] wrote ${outPath}`)
console.log(`[generate-nav-script] NAVIGATION = "${NAV}"`)
console.log(`[generate-nav-script] NAVIGATION_START = "${NAV_START}"`)
