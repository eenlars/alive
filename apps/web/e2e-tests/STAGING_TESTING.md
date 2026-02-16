# Running E2E Tests Against Staging

## Overview

E2E tests run against staging using test secret authentication.

## Setup

### 1. Set E2E Test Secret

The test endpoints (`/api/test/bootstrap-tenant` and `/api/test/verify-tenant`) require authentication:

**Staging:**
- Requires `E2E_TEST_SECRET` header
- Secret must be set in environment files

### 2. Generate Secrets

```bash
# Staging secret
openssl rand -hex 32
```

### 3. Configure Environment File

**`.env.staging`:**
```bash
E2E_TEST_SECRET=your_staging_secret_here
```

## Running Tests

### Against Staging

```bash
# Set the secret in your environment
export E2E_TEST_SECRET="your_staging_secret_here"

# Run tests against staging
ENV_FILE=.env.staging bun run test:e2e
```

## How It Works

### Request Flow

1. **Global Setup** reads `E2E_TEST_SECRET` from environment
2. Adds `x-test-secret` header to all test endpoint requests
3. **Test Endpoints** validate:
   - `x-test-secret` header matches `E2E_TEST_SECRET`

### Security

- Test endpoints return 404 if unauthorized (security through obscurity)
- Only bootstrap and verify endpoints are affected
- Regular app endpoints unaffected

## Files Affected

- `app/api/test/bootstrap-tenant/route.ts` - Creates test users
- `app/api/test/verify-tenant/route.ts` - Checks tenant readiness
- `e2e-tests/global-setup.ts` - Sends secret header
- `.env.staging` - Stores staging test secret

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
E2E_TEST_SECRET="correct_secret" ENV_FILE=.env.staging bun run test:e2e
```

### Tests Pass Locally But Fail on Staging

- Check secret is set in staging `.env.staging`
- Verify secret matches what your test runner exports
- Confirm staging server has restarted with new env

## Best Practices

1. **Never commit real secrets** to git
2. **Store the staging secret** in a secure secret manager
3. **Rotate secrets** periodically
4. **Limit staging E2E runs** to avoid DB pollution
5. **Prefer targeted spec runs** before full suite runs
