# Domain Normalization

**Status:** ✅ Implemented
**Date:** 2025-11-16

## Overview

All domain inputs across the Alive system are automatically normalized to lowercase to ensure consistency and prevent case-sensitivity issues.

## Implementation

### Defense-in-Depth Strategy

Domain lowercasing is enforced at **every layer** to ensure robustness:

#### 1. UI Layer (React Forms)
- **DeployForm.tsx** - Custom domain input
  - Real-time transformation as user types
  - Submit handler lowercases before API call
- **SubdomainDeployForm.tsx** - Subdomain `.alive.best` input
  - Lowercases slug on form submit

#### 2. API Layer (Next.js Routes)
- **`/api/deploy/route.ts`** - Uses `normalizeAndValidateDomain()` utility
- **`/api/deploy-subdomain/route.ts`** - Uses `buildSubdomain()` utility
- **`/api/manager/route.ts`** - Lowercases on POST (update) and DELETE operations

#### 3. Service Layer (TypeScript)
- **`lib/deployment/deploy-site.ts`** - Lowercases before passing to bash scripts
- **`lib/config.ts`** - `buildSubdomain()` lowercases slug automatically
- **`features/chat/lib/workspaceRetriever.ts`** - Uses `normalizeDomain()` utility

#### 4. Infrastructure Layer (Bash Scripts)
- **`deploy-site-systemd.sh`** - Transforms `$1` input immediately
- **`delete-site.sh`** - Transforms `$1` input immediately

### Core Utility

```typescript
// features/manager/lib/domain-utils.ts
export function normalizeDomain(input: string): string {
  let domain = input.trim()
  domain = domain.replace(/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//, '') // Remove protocol
  domain = domain.replace(/^www\./i, '') // Remove www
  domain = domain.replace(/\/.*$/, '') // Remove path
  domain = domain.replace(/:\d+$/, '') // Remove port
  domain = domain.toLowerCase() // LOWERCASE
  return domain.trim()
}
```

### Bash Script Pattern

```bash
DOMAIN=$(echo "$1" | tr '[:upper:]' '[:lower:]')  # Convert to lowercase
SLUG=${DOMAIN//[^a-zA-Z0-9]/-}  # Convert to systemd-safe name
```

## Benefits

1. **Consistency** - Domains always stored/compared in same case
2. **DNS Compliance** - DNS is case-insensitive; lowercase matches standard
3. **File System Safety** - Prevents duplicate directories (e.g., `Example.com` vs `example.com`)
4. **systemd Safety** - Service names are always lowercase and consistent
5. **Database Integrity** - Prevents duplicate workspace entries

## Testing

To verify lowercase transformation:

```bash
# Test deploy with uppercase domain
curl -X POST http://localhost:9000/api/deploy \
  -H "Content-Type: application/json" \
  -d '{"domain":"EXAMPLE.COM","password":"test123"}'

# Should create: /srv/webalive/sites/example.com
```

## Files Modified

### Frontend
- `apps/web/features/deployment/components/DeployForm.tsx`
- `apps/web/features/deployment/components/SubdomainDeployForm.tsx` (already had lowercase)

### API Routes
- `apps/web/app/api/manager/route.ts`

### Libraries
- `apps/web/lib/deployment/deploy-site.ts`
- `apps/web/lib/config.ts`
- `apps/web/features/manager/lib/domain-utils.ts` (already had `normalizeDomain`)
- `apps/web/features/chat/lib/workspaceRetriever.ts` (already used `normalizeDomain`)

### Scripts
- `scripts/sites/deploy-site-systemd.sh`
- `scripts/sites/delete-site.sh`

## Related Documentation

- Domain validation: `docs/guides/dns-validation-design.md`
- Deployment: `docs/deployment/deployment.md`
- Workspace security: `docs/security/workspace-enforcement.md`
