# Running E2E Tests Against Staging/Production

## Overview

E2E tests can run against deployed environments (staging/production) using test secret authentication.

## Setup

### 1. Set E2E Test Secret

The test endpoints (`/api/test/bootstrap-tenant` and `/api/test/verify-tenant`) require authentication:

**Local/Test Environment:**
- Automatically accessible when `ALIVE_ENV=local` or `NODE_ENV=test`
- No secret needed

**Staging/Production:**
- Requires `E2E_TEST_SECRET` header
- Secret must be set in environment files

### 2. Generate Secrets

```bash
# Staging secret
openssl rand -hex 32

# Production secret (MUST be different!)
openssl rand -hex 32
```

### 3. Configure Environment Files

**`.env.staging`:**
```bash
E2E_TEST_SECRET=your_staging_secret_here
```

**`.env.production`:**
```bash
E2E_TEST_SECRET=your_production_secret_here
```

⚠️ **CRITICAL:** Use different secrets for each environment!

## Running Tests

### Against Staging

```bash
# Set the secret in your environment
export E2E_TEST_SECRET="your_staging_secret_here"

# Run tests against staging
TEST_ENV=staging bun run test:e2e
```

### Against Production (Rare)

```bash
# Set the production secret
export E2E_TEST_SECRET="your_production_secret_here"

# Run tests (use with caution!)
TEST_ENV=production bun run test:e2e
```

## How It Works

### Request Flow

1. **Global Setup** reads `E2E_TEST_SECRET` from environment
2. Adds `x-test-secret` header to all test endpoint requests
3. **Test Endpoints** validate:
   - Environment is test/local, OR
   - `x-test-secret` header matches `E2E_TEST_SECRET`

### Security

- Test endpoints return 404 if unauthorized (security through obscurity)
- Secrets are environment-specific (staging ≠ production)
- Only bootstrap and verify endpoints are affected
- Regular app endpoints unaffected

## Files Affected

- `app/api/test/bootstrap-tenant/route.ts` - Creates test users
- `app/api/test/verify-tenant/route.ts` - Checks tenant readiness
- `e2e-tests/global-setup.ts` - Sends secret header
- `.env.staging` / `.env.production` - Store secrets

## Troubleshooting

### "UNAUTHORIZED" Error

```
❌ Worker 0 bootstrap failed: UNAUTHORIZED
```

**Cause:** Missing or incorrect `E2E_TEST_SECRET`

**Fix:**
```bash
# Ensure secret is exported
export E2E_TEST_SECRET="correct_secret"

# Or set in shell
E2E_TEST_SECRET="correct_secret" TEST_ENV=staging bun run test:e2e
```

### Tests Pass Locally But Fail on Staging

- Check secret is set in staging `.env.staging`
- Verify secret matches what you're using locally
- Confirm staging server has restarted with new env

## Best Practices

1. **Never commit real secrets** to git
2. **Use different secrets** per environment
3. **Rotate secrets** periodically
4. **Limit staging E2E runs** to avoid DB pollution
5. **Prefer local testing** for development
