# Reverse Proxy Redirects Guide

## Problem

When Next.js runs behind a reverse proxy (Caddy), `req.url` contains `localhost:PORT` instead of the actual public domain. This causes redirects to use localhost URLs instead of the proper domain.

**Example:**
- User visits: `https://dev.terminal.alive.best/api/auth/linear`
- `req.url` contains: `http://localhost:8997/api/auth/linear`
- Redirect goes to: `https://localhost:8997/settings` ❌

## Root Cause

Next.js doesn't automatically rewrite `req.url` based on `X-Forwarded-*` headers for security reasons. When Caddy forwards requests, it sets these headers:
- `X-Forwarded-Host: dev.terminal.alive.best`
- `X-Forwarded-Proto: https`
- `Host: localhost:8997`

But Next.js uses the original request URL, not the forwarded headers.

## Solution

Use the utility in `/lib/request-url.ts` (parses headers once):

```typescript
import { getRequestUrls } from "@/lib/request-url"

export async function GET(req: NextRequest) {
  // Get correct URLs from proxy headers (single header parse)
  const { baseUrl, fullUrl } = getRequestUrls(req)

  // baseUrl: "https://dev.terminal.alive.best"
  // fullUrl: "https://dev.terminal.alive.best/api/auth/linear?code=..."

  // Use baseUrl for redirects
  return NextResponse.redirect(
    new URL("/settings?status=success", baseUrl)
  )

  // Use fullUrl for parsing current request
  const { searchParams } = new URL(fullUrl)
  const code = searchParams.get("code")
}
```

## Why Single Function

**DRY Principle:** `getRequestUrls()` parses headers once and returns both values. Calling separate `getBaseUrl()` and `getFullUrl()` would parse headers twice.

**Performance:** Single header lookup, not duplicated.

**DON'T use `req.url` directly for redirects** - it will contain localhost!

## Environment Variables

The environment-specific redirect URIs are set in:
- `.env.development` - Dev environment (dev.terminal.alive.best)
- `.env.staging` - Staging environment
- `.env.production` - Production environment

The base `.env` file should NOT set `LINEAR_REDIRECT_URI` or `NEXT_PUBLIC_APP_URL` to avoid overriding environment-specific values.

## Testing

Tests are in `/lib/request-url.test.ts` - run with:
```bash
cd apps/web && bun run test request-url.test.ts
```

## Examples in Codebase

- **Linear OAuth**: `app/api/auth/linear/route.ts` - All redirects use `getBaseUrl(req)`
- **Future OAuth integrations**: Follow the same pattern

## Why This Matters

Without this fix:
1. OAuth callbacks fail (redirects to localhost)
2. Users see SSL errors (browser tries to reach localhost over HTTPS)
3. Session cookies may not work (domain mismatch)
