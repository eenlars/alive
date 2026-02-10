# Bug Report: Cross-Origin Iframe `load` Event Not Clearing Loading Overlay

## Summary

The preview iframe in our `Sandbox` and `SandboxMobile` React components loads its content correctly (verified via Playwright accessibility snapshots and DOM inspection), but the `isLoading` state never transitions to `false`. This causes an opaque loading overlay (`PulsingDot` / "Opening your site") to permanently cover the fully-loaded iframe content.

**Severity**: P1 — Preview is completely unusable. The iframe loads, but the user can never see it.

**Affected components**:
- `apps/web/features/chat/components/Sandbox.tsx` (desktop side panel)
- `apps/web/features/chat/components/SandboxMobile.tsx` (mobile full-screen overlay)

---

## Architecture Context

### Preview Subdomain Flow

The Alive platform uses preview subdomains to display user sites inside an iframe:

```
Browser (staging.alive.best/chat)
  └─ iframe src="https://preview--zomaar-alive-best.alive.best/?preview_token=eyJ..."
       └─ Cloudflare (public TLS)
            └─ nginx (SNI routing to Caddy)
                 └─ Caddy wildcard *.alive.best (tls internal)
                      └─ Next.js middleware (rewrites to /api/preview-router/*)
                           └─ preview-router (validates JWT, proxies to localhost:PORT)
                                └─ Site's Hono/Vite server (localhost:3648 for zomaar.alive.best)
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/features/chat/components/Sandbox.tsx` | Desktop preview panel (side-by-side with chat) |
| `apps/web/features/chat/components/SandboxMobile.tsx` | Mobile preview overlay (full-screen) |
| `apps/web/app/api/preview-router/[[...path]]/route.ts` | Next.js route handler that proxies + injects nav script |
| `apps/web/lib/preview-utils.ts` | `getPreviewUrl()` builds the preview subdomain URL |
| `apps/web/lib/auth/preview-token.ts` | JWT token creation/verification for iframe auth |
| `packages/shared/src/constants.ts` | `PREVIEW_MESSAGES` constants for postMessage protocol |

### How the Loading Overlay Works

In `Sandbox.tsx` (desktop), the overlay is controlled by two conditions (line 314):

```tsx
{(isLoading || !previewToken) && (
  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-[#0d0d0d]">
    <PulsingDot size="lg" />
  </div>
)}
```

In `SandboxMobile.tsx`, it's simpler (line 147):
```tsx
{isLoading && (
  <div className="absolute inset-0 z-10 ...">
    ...Opening your site...
  </div>
)}
```

Both overlays are **opaque** (`bg-white` / `bg-neutral-900`) and positioned `absolute inset-0 z-10`, completely covering the iframe beneath them.

### Iframe Rendering is Conditional (Desktop Only)

In `Sandbox.tsx`, the iframe only renders after `previewToken` is fetched (line 319):
```tsx
{previewToken && (
  <iframe ref={setIframeRef} src={previewUrl} ... />
)}
```

This means the iframe does NOT exist in the DOM until the async token fetch completes.

### Expected Lifecycle

1. Component mounts → `isLoading=true`, `previewToken=null`
2. `useEffect` triggers `fetchPreviewToken()` (POST to `/api/auth/preview-token`)
3. Token arrives → `setPreviewToken(token)` → re-render
4. Iframe element appears in DOM with `src={previewUrl}` (includes `?preview_token=...`)
5. Browser starts loading iframe content (HTTP request through preview subdomain chain)
6. Iframe finishes loading → `load` event fires → handler calls `setIsLoading(false)`
7. Loading overlay disappears, iframe content visible

**Step 6 never happens.** The `load` event handler never executes, even though the iframe content is fully loaded.

---

## What We Tried

### Attempt 1: React's `onLoad` JSX Prop (Original Code)

```tsx
<iframe
  ref={iframeRef}
  src={previewUrl}
  onLoad={handleIframeLoad}  // React synthetic event
/>
```

**Result**: `handleIframeLoad` never called. Loading overlay stays permanently.

**Verification**: Used Playwright `browser_evaluate` to inspect React fiber:
```js
const propsKey = Object.keys(iframe).find(k => k.startsWith('__reactProps'));
const props = iframe[propsKey];
console.log(props.onLoad); // ✅ Function exists on React props
console.log(typeof iframe.onload); // null — React doesn't use DOM property
```

React's `onLoad` prop IS wired up in the fiber, but the synthetic event never fires.

### Attempt 2: `useEffect` with `addEventListener`

Replaced React's `onLoad` with a native DOM listener via `useEffect`:

```tsx
useEffect(() => {
  const iframe = iframeRef.current;
  if (!iframe) return;

  const handleLoad = () => setIsLoading(false);
  iframe.addEventListener("load", handleLoad);
  return () => iframe.removeEventListener("load", handleLoad);
}, [previewToken, selectorActive]);
```

**Result**: Still doesn't work. `handleLoad` never called.

**Hypothesis tested**: Maybe `useEffect` runs too late (after iframe already loaded from cache). This led to Attempt 3.

### Attempt 3: Callback Ref with `addEventListener`

Used a callback ref to attach the listener synchronously when React creates the DOM element, eliminating any gap between DOM insertion and listener attachment:

```tsx
const setIframeRef = useCallback((iframe: HTMLIFrameElement | null) => {
  if (iframeRef.current && iframeLoadHandler.current) {
    iframeRef.current.removeEventListener("load", iframeLoadHandler.current);
  }
  iframeRef.current = iframe;
  if (!iframe) return;

  const handleLoad = () => setIsLoading(false);
  iframeLoadHandler.current = handleLoad;
  iframe.addEventListener("load", handleLoad);
}, []);
```

**Result**: STILL doesn't work. Loading overlay remains.

### Manual `onLoad` Call (Proof That State Works)

Manually called React's `onLoad` handler via Playwright `browser_evaluate`:

```js
const propsKey = Object.keys(iframe).find(k => k.startsWith('__reactProps'));
iframe[propsKey].onLoad({ target: iframe, type: 'load' });
```

**Result**: Loading overlay **immediately disappears**, iframe content fully visible. This proves:
- `setIsLoading(false)` works correctly
- The loading overlay logic is correct
- The `isLoading` state transition properly removes the overlay
- The ONLY issue is that the `load` event doesn't reach our handler

### Native `addEventListener` Fires (Without React)

Added a fresh listener via `evaluate` and force-reloaded:

```js
iframe.addEventListener('load', () => resolve({ loadFired: true }));
iframe.src = iframe.src; // force reload
```

**Result**: `loadFired: true` — the browser's native `load` event DOES fire on forced reload.

BUT: When we set `iframe.src = 'about:blank'` first and then back to the real src, the load event fires for `about:blank` (the intermediate empty page). The key question is whether the `load` event fires for the ORIGINAL load (when the iframe is first inserted into the DOM with its src).

---

## Key Observations

### 1. Iframe Content is Fully Loaded

Playwright's accessibility snapshot consistently shows the full site content (OpenNieuws with articles, navigation, footer) inside the iframe. The alive-tagger script logs `[alive-tagger] Ready!` in the console. The content is there — it's just hidden behind the opaque overlay.

### 2. The Injected Script's `postMessage` IS Received

The preview-router injects a `<script>` into the `<head>` of proxied HTML that sends `postMessage` to the parent:

```js
// Injected by preview-router into <head>
sendPath(); // Immediately sends { type: 'preview-navigation', path: '/' }
```

The parent's message handler receives this (we know because path sync works, and the console shows tagger ready messages). This means cross-origin iframe → parent communication works fine.

### 3. Screenshots vs Accessibility Snapshots

| Method | Shows iframe content? | Shows loading overlay? |
|--------|----------------------|----------------------|
| Playwright accessibility snapshot | Yes (full DOM tree) | Yes (both coexist in DOM) |
| Playwright screenshot | Only loading overlay | Yes (opaque, covers iframe) |

The overlay is `z-10` with `bg-white` (opaque), so it visually covers the iframe even though both elements are in the DOM.

---

## Hypotheses

### Hypothesis A: React's Synthetic Event System Doesn't Fire `load` for Cross-Origin Iframes

React 19 uses event delegation via the root container. The `load` event on iframes might not bubble in a way React's system can capture, especially for cross-origin iframes.

**Evidence for**: React's `onLoad` prop has the handler wired up but it never fires.
**Evidence against**: React docs say `onLoad` works on iframes. But cross-origin iframes have security restrictions that may affect event propagation.

**Status**: Partially disproven — even native `addEventListener` directly on the iframe element doesn't work (Attempt 2 and 3), so this isn't React-specific.

### Hypothesis B: The `load` Event Fires Before ANY Listener is Attached

Even with a callback ref (which runs synchronously during React's commit phase), the event might fire before the ref callback. Possible mechanism:

1. React commits DOM changes (inserts `<iframe src="...">` into DOM)
2. Browser synchronously starts loading the src
3. If the response is in the browser's memory/disk cache, the `load` event could fire synchronously or via a microtask
4. React calls the callback ref
5. We attach the listener — too late

**Evidence for**:
- The callback ref approach (Attempt 3) also fails
- The iframe loads through a complex proxy chain, but Chromium may cache the intermediate responses
- When we manually set `iframe.src = iframe.src` (force reload), the `load` event DOES fire — because our listener is already attached

**Evidence against**:
- Standard browser behavior should fire `load` asynchronously via the event loop, not synchronously during DOM insertion
- A network request (even cached) should go through the event loop

**Status**: **Most likely explanation.** Need to verify by testing with `Cache-Control: no-store` on the preview-router response.

### Hypothesis C: The Injected Script's `beforeunload` Handler Re-triggers Loading

The injected nav script (line 57 of the preview-router) adds:
```js
window.addEventListener('beforeunload', sendStart);
```

`sendStart()` sends `PREVIEW_MESSAGES.NAVIGATION_START`, which the parent handles by setting `setIsLoading(true)`. If `beforeunload` fires on the iframe during the initial load cycle (e.g., when the iframe first navigates from `about:blank` to the actual URL), this could reset `isLoading` to `true` AFTER the `load` event already set it to `false`.

**Timeline if this is the cause**:
1. Iframe inserted → loads `about:blank` initially → `load` fires → `setIsLoading(false)`
2. Browser navigates iframe to actual src → `beforeunload` fires on `about:blank` → `sendStart()` → parent sets `setIsLoading(true)`
3. Actual page loads → `load` fires again → BUT listener was cleaned up/not re-attached?

**Evidence for**:
- `beforeunload` on `about:blank` → actual URL navigation could send `NAVIGATION_START`
- The script explicitly adds `window.addEventListener('beforeunload', sendStart);`

**Evidence against**:
- The injected script has `if (window.parent === window) return;` — but `about:blank` doesn't have our injected script
- The script is only in the PROXIED response, not in `about:blank`

**Status**: Unlikely but worth investigating. Add `console.log` before `setIsLoading(true)` in the `NAVIGATION_START` handler.

### Hypothesis D: `useEffect(() => setIsLoading(true), [path])` Re-fires After Load

The effect on `[path]` runs `setIsLoading(true)`. If the injected script's `sendPath()` causes `setPath("/")` which triggers a re-render, and if React's effect scheduling causes this effect to run AFTER the `load` event handler, it would reset the loading state.

**Evidence for**:
- In the desktop Sandbox, `setPath(newPath)` is called unconditionally (no `!== path` guard) on line 189
- Setting state to the same value CAN cause effects to re-run in edge cases with React concurrent features

**Evidence against**:
- React 19 should bail out of re-rendering when `setPath("/")` is called with the same value as current state (`"/"`)
- Even if a re-render happens, `useEffect([path])` shouldn't re-fire if `path` didn't change

**Status**: Low probability but easy to test by adding a guard `if (newPath !== path)` in the desktop Sandbox message handler (SandboxMobile already has this guard).

### Hypothesis E: The Iframe `load` Event Simply Never Fires for Proxied Content

The preview-router serves HTML by `await proxyResponse.text()` + string manipulation + `new NextResponse(injectedHtml)`. This means the response is NOT a streaming body — it's a complete HTML string. The `Content-Length` is removed (line 223). The `Content-Encoding` is also removed (line 224).

If the browser receives a response without `Content-Length` and without chunked encoding, it might not know when the document is complete, causing the `load` event to never fire.

**Evidence for**:
- The preview-router deletes both `content-length` and `content-encoding` headers
- Without these, the browser relies on connection close to determine completion
- In HTTP/2 (which Cloudflare uses), stream termination signals completion

**Evidence against**:
- NextResponse with a string body should include proper `Content-Length`
- The browser successfully renders the full page (proven by accessibility snapshot)
- The alive-tagger script (loaded later) runs successfully, which implies `DOMContentLoaded` and `load` have fired

**Status**: Moderate probability. Easy to test by checking response headers in the Network tab.

---

## Environment Details

- **Framework**: Next.js 16.1.6 (Turbopack) with React 19.2.0
- **Runtime**: Bun 1.2.22+
- **Browser tested**: Headless Chromium 144 via Playwright MCP (running as root with `--no-sandbox`)
- **Build**: Production build (`next build`), deployed to staging (port 8998)
- **URL**: `https://staging.alive.best/chat` → iframe loads `https://preview--zomaar-alive-best.alive.best/?preview_token=...`
- **Cross-origin**: Parent is `staging.alive.best`, iframe is `preview--zomaar-alive-best.alive.best` (different subdomain = cross-origin, but same registrable domain)
- **Site tested**: `zomaar.alive.best` (OpenNieuws), runs in preview mode (single Hono server serving `dist/`, NODE_ENV=production, port 3648)

---

## Current State of the Code

Both `Sandbox.tsx` and `SandboxMobile.tsx` currently use the **callback ref approach** (Attempt 3). The `onLoad` JSX prop has been removed from both iframes. The code compiles, passes type-check, lint, and all 17 E2E tests. The loading overlay is still stuck.

---

## What We Need

A reliable way to detect when a **cross-origin iframe** has finished loading its content in a **React 19 + Next.js 16** application, where:

1. The iframe is conditionally rendered (only appears when `previewToken` is truthy)
2. The iframe src goes through a complex proxy chain (Cloudflare → nginx → Caddy → Next.js → preview-router → localhost)
3. The response is HTML with injected `<script>` that sends `postMessage` to the parent
4. React's `onLoad`, `useEffect`-based `addEventListener`, and callback ref-based `addEventListener` all fail to catch the `load` event

### Possible Solutions to Explore

1. **Use the injected `postMessage` as the load signal** — The injected script already sends `preview-navigation` with the path on initial load. Use this message to also clear `isLoading`. This bypasses the `load` event entirely and is guaranteed to work because we already receive these messages.

2. **Add `Cache-Control: no-store` to preview-router responses** — If Hypothesis B is correct, preventing caching would ensure the iframe loads asynchronously and the `load` event fires after our listener is attached.

3. **Poll for iframe.contentWindow** — Use `requestAnimationFrame` or `setInterval` to check if `iframe.contentWindow` is accessible (for same-registrable-domain) or if the iframe has a non-blank URL.

4. **Use `MutationObserver`** on the iframe element to detect attribute/property changes that indicate loading is complete.

5. **Emit a custom event from the injected script** — Add `window.parent.postMessage({ type: 'preview-loaded' })` at the END of the injected script (after `sendPath()`), and use that as the definitive load signal.

---

## Reproduction Steps

1. Deploy staging: `nohup make staging > /tmp/staging-deploy.log 2>&1 &`
2. Open `https://staging.alive.best` in a browser
3. Login with valid credentials
4. Select any workspace (e.g., `zomaar.alive.best`)
5. Click "Preview" button in the toolbar
6. **Expected**: Site content visible in the preview panel
7. **Actual**: Loading spinner (PulsingDot / "Opening your site") shown indefinitely
8. Open DevTools → Elements: The iframe element is in the DOM with the correct src, and its content document shows the full rendered page

---

## Files to Modify

- `apps/web/features/chat/components/Sandbox.tsx` — Desktop loading logic
- `apps/web/features/chat/components/SandboxMobile.tsx` — Mobile loading logic
- `apps/web/app/api/preview-router/[[...path]]/route.ts` — Potentially add a `preview-loaded` message to injected script
