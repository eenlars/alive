# Environment Variables Management

**Architectural Pattern:** Single Source of Truth for Secrets

This document describes how environment variables are organized in the Alive monorepo to prevent duplication and configuration drift.

## Architecture Overview

```
alive/
├── .env                          # ⚠️  Makefile/build variables ONLY (no secrets)
├── .env.local                    # ✅ Local development overrides (optional)
├── apps/web/
│   ├── .env.production           # ✅ ALL SECRETS + production config (loaded by systemd)
│   ├── .env.development          # ✅ Dev-specific overrides (URLs, ports)
│   └── .env.staging              # ✅ Staging-specific overrides (URLs, ports)
```

**Key Principle:** `apps/web/.env.production` is the single source of truth for secrets (loaded by systemd via `EnvironmentFile`). Root `.env` contains only Makefile/build variables.

## Principles

### 1. Single Source of Truth
**All secrets live in `apps/web/.env.production` (loaded by systemd).**

- ✅ `JWT_SECRET`, `SUPABASE_*`, `LOCKBOX_MASTER_KEY`, API keys → all in `.env.production`
- ❌ Never put secrets in root `.env` (that's for build variables only)

### 2. Environment-Specific Overrides
**Environment-specific config (non-secrets) live in app-level env files.**

- ✅ `LINEAR_REDIRECT_URI`, `NEXT_PUBLIC_APP_URL` (varies per environment)
- ✅ Port numbers, domain names, feature flags
- ❌ No secrets or API keys

### 3. Automatic Validation
**Missing env vars fail fast at startup.**

- Validation runs on app import (see `apps/web/lib/env-validation.ts`)
- Clear error messages with fix suggestions
- Prevents runtime errors from missing config

## File Purposes

### Root `.env` (Optional)
**Makefile and build variables only. NO secrets.**

```bash
# Root .env - BUILD VARIABLES ONLY
HOSTED_ENV=server
# ... build configuration only
```

**When to update:**
- Changing build configuration
- Adding Makefile variables

### Root `.env.local` (Optional)
**Local development overrides only.**

```bash
# .env.local - Local dev overrides
ALIVE_ENV=local
JWT_SECRET=local-dev-secret  # Override for local testing only
```

**When to use:**
- Local development testing
- Debugging with different secrets
- **Never commit this file**

### `apps/web/.env.development`
**Development environment URLs and non-secret config.**

```bash
# Development-specific overrides
# Port: 8997 | Domain: dev.terminal.goalive.nl
LINEAR_REDIRECT_URI=https://dev.terminal.goalive.nl/api/auth/linear
NEXT_PUBLIC_APP_URL=https://dev.terminal.goalive.nl
```

**When to update:**
- Development domain changes
- Dev-specific feature flags

### `apps/web/.env.staging`
**Staging environment URLs and non-secret config.**

```bash
# Staging-specific overrides
# Port: 8998 | Domain: staging.terminal.goalive.nl
LINEAR_REDIRECT_URI=https://staging.terminal.goalive.nl/api/auth/linear
NEXT_PUBLIC_APP_URL=https://staging.terminal.goalive.nl
E2E_TEST_SECRET=staging-test-secret
```

**When to update:**
- Staging domain changes
- Staging-specific test config

### `apps/web/.env.production`
**Single source of truth for ALL secrets + production config. Loaded by systemd.**

```bash
# Production secrets + config (loaded via systemd EnvironmentFile)
JWT_SECRET=your-secret-here
SUPABASE_SERVICE_ROLE_KEY=your-key-here
LOCKBOX_MASTER_KEY=your-key-here
LINEAR_REDIRECT_URI=https://terminal.goalive.nl/api/auth/linear
NEXT_PUBLIC_APP_URL=https://terminal.goalive.nl
# ... all secrets and production config
```

**When to update:**
- Adding a new API integration or secret
- Rotating secrets/keys
- Production domain changes

## How Next.js Loads Environment Variables

Next.js loads env files in this order (first match wins):

1. `process.env` (system environment)
2. `.env.$(NODE_ENV).local` (environment-specific local overrides)
3. `.env.local` (local overrides, not loaded when NODE_ENV=test)
4. `.env.$(NODE_ENV)` (environment-specific)
5. `.env` (base configuration)

**Important:** Next.js loads from **both** project root and app directory, with **app directory taking precedence**.

For production, systemd loads `apps/web/.env.production` directly via `EnvironmentFile`, bypassing Next.js env loading. This is why:
- Secrets live in **`apps/web/.env.production`** (loaded by systemd for prod)
- Root `.env` is for Makefile/build variables only

## Common Tasks

### Adding a New Secret

1. **Add to `apps/web/.env.production`:**
   ```bash
   # apps/web/.env.production
   NEW_API_KEY=your-secret-key-here
   ```

2. **Add to validation** (if required):
   ```typescript
   // apps/web/lib/env-validation.ts
   const ENV_CONFIG: EnvConfig = {
     required: [
       // ... existing
       "NEW_API_KEY",  // Add here if required
     ],
     // ...
   }
   ```

3. **Restart dev server:**
   ```bash
   systemctl restart alive-dev
   ```

### Adding an Environment-Specific Override

1. **Add to appropriate app-level file:**
   ```bash
   # apps/web/.env.development
   FEATURE_FLAG_NEW_UI=true
   ```

2. **No restart needed** (Next.js hot-reloads env changes in dev mode)

### Rotating JWT_SECRET

**⚠️ WARNING:** Rotating JWT_SECRET invalidates all existing user sessions!

1. **Generate new secret:**
   ```bash
   openssl rand -base64 32
   ```

2. **Update `apps/web/.env.production`:**
   ```bash
   # apps/web/.env.production
   JWT_SECRET=NEW_SECRET_HERE
   ```

3. **Restart all environments:**
   ```bash
   systemctl restart alive-dev      # Dev
   systemctl restart alive-staging  # Staging
   systemctl restart alive-prod     # Production
   ```

4. **Users must log out and log back in** to get new tokens

## Troubleshooting

### Error: "Missing required environment variables"

**Symptom:**
```
❌ Missing required environment variables:
   - JWT_SECRET
   - SUPABASE_URL
```

**Solution:**
1. Check `apps/web/.env.production` file exists
2. Verify variables are set (not empty)
3. Restart server: `systemctl restart alive-prod`

### Error: "invalid signature" (JWT verification)

**Symptom:**
```
[JWT] Invalid token: invalid signature
```

**Root Cause:** JWT_SECRET mismatch between token signing and verification

**Solution:**
1. Ensure JWT_SECRET is consistent across all env files
2. Delete any `apps/web/.env` file (should not exist)
3. Restart server
4. **User must log out and log back in** to get new token

### Environment Variables Not Updating

**Issue:** Changed env var but app still uses old value

**Solution:**
1. **Hard restart required** for env changes (not hot-reload):
   ```bash
   systemctl restart alive-dev
   ```
2. For Next.js, clear Turbo cache if needed:
   ```bash
   bun run clean && bun run dev
   ```

## Historical Context

**Before (Problematic):**
- Secrets duplicated in root `.env` AND `apps/web/.env`
- JWT_SECRET had different values in each location
- Token signing used one secret, verification used another
- Result: `invalid signature` errors, UNAUTHORIZED responses

**After (Current Setup):**
- All secrets in `apps/web/.env.production` (single source of truth, loaded by systemd)
- Root `.env` contains only Makefile/build variables
- Automatic validation prevents missing vars
- Clear error messages guide fixes

**Related Issue:** [2025-11-24 JWT Signature Mismatch](../troubleshooting/common-issues.md#jwt-signature-mismatch)

## Best Practices

1. **Never commit secrets** - Add to `.gitignore` if not already there
2. **Use `.env.local` for local testing** - Override secrets safely
3. **Document new env vars** - Add to validation and this doc
4. **Rotate secrets periodically** - Especially JWT_SECRET and API keys
5. **Test after env changes** - Log out/in to verify authentication works

## Related Documentation

- [JWT Authentication](../security/jwt-authentication.md)
- [Workspace Isolation](../architecture/workspace-privilege-separation.md)
- [Supabase Configuration](../architecture/database-setup.md)

## Validation Utility

The env validation utility (`apps/web/lib/env-validation.ts`) runs automatically on app startup:

```typescript
import "@/lib/env-validation" // In apps/web/app/layout.tsx
```

**Features:**
- ✅ Validates all required env vars are present
- ✅ Warns about insecure defaults in production
- ✅ Provides clear error messages with fix suggestions
- ✅ Fails fast (process exits) to prevent runtime errors
- ✅ Helper functions: `getEnv()`, `getOptionalEnv()`

**Usage in code:**
```typescript
import { getEnv, getOptionalEnv } from "@/lib/env-validation"

// Required variable (throws if missing)
const jwtSecret = getEnv("JWT_SECRET")

// Optional variable with fallback
const groqKey = getOptionalEnv("GROQ_API_SECRET", "default-value")
```

## Questions?

If you encounter issues with environment variables:
1. Check this guide first
2. Review [Common Issues](../troubleshooting/common-issues.md)
3. Verify your `.env` files match the architecture above
4. Ask in team chat if still stuck
