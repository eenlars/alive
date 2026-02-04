# ✅ Supabase IAM Setup Complete

**Date**: 2025-11-14
**Environment**: Staging (`dev.terminal.goalive.nl`)

## What Was Done

### 1. Environment Configuration

Added Supabase credentials to `.env`:

```bash
# Server-side
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_PROJECT_ID="your-project-id"
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
SUPABASE_ANON_KEY="eyJ..."

# Client-side (browser)
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
```

### 2. IAM Schema Types Generated

Created `lib/supabase/iam-types.ts` with TypeScript definitions for:
- ✅ `users` table (Row, Insert, Update types)
- ✅ `sessions` table
- ✅ `workspaces` table

**Regeneration command**:
```bash
bun run gen:iam
```

### 3. Type-Safe IAM Client

Created `lib/supabase/iam.ts` with:
- ✅ `createIamClient()` - Server-side only IAM client
- ✅ Schema-scoped queries (auto-prefixed with `iam.`)
- ✅ Type exports: `IamUser`, `IamSession`, `IamWorkspace`
- ✅ Insert/Update types for all tables

### 4. Documentation

Added comprehensive guides:
- ✅ `lib/supabase/README.md` - Overview of all clients
- ✅ `lib/supabase/EXAMPLE.md` - Usage examples
- ✅ `scripts/generate-iam-types.ts` - Type generation script

## Files Created/Modified

```
apps/web/
├── .env                                  # Added Supabase env vars
├── package.json                          # Added gen:iam script
├── lib/
│   └── supabase/
│       ├── iam.ts                       # ✨ NEW: IAM client
│       ├── iam-types.ts                 # ✨ NEW: Generated types
│       ├── README.md                    # ✨ NEW: Documentation
│       ├── EXAMPLE.md                   # ✨ NEW: Usage examples
│       └── SETUP_COMPLETE.md            # ✨ NEW: This file
└── scripts/
    └── generate-iam-types.ts             # ✨ NEW: Type generator
```

## Verification Tests

All tests passed ✅:

```bash
# 1. Server-side connection
curl http://localhost:8998/api/test-supabase
# ✅ Connected to your-project.supabase.co

# 2. Environment variables
curl http://localhost:8998/api/test-supabase-config
# ✅ All 6 variables loaded correctly
```

## Usage Examples

### Query Users

```typescript
import { createIamClient, type IamUser } from "@/lib/supabase/iam"

export async function GET() {
  const iam = await createIamClient("service")

  const { data: users, error } = await iam.from("users").select("*")

  return Response.json({ users })
}
```

### Find User by Email

```typescript
import { createIamClient } from "@/lib/supabase/iam"

const iam = await createIamClient("service")
const { data: user } = await iam
  .from("users")
  .select("*")
  .eq("email", "user@example.com")
  .single()
```

### Create Session

```typescript
import { createIamClient, type IamSessionInsert } from "@/lib/supabase/iam"

const iam = await createIamClient("service")
const session: IamSessionInsert = {
  user_id: userId,
  token: randomToken,
  expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
}

const { data } = await iam.from("sessions").insert(session).select().single()
```

## Security Notes

✅ IAM client is **server-side only** (throws error if imported in browser)
✅ Uses **service role key** by default for admin operations
✅ Schema-scoped to `iam` (cannot accidentally query public schema)
✅ Type-safe operations prevent typos and runtime errors

## Next Steps

1. **Implement IAM authentication** using the new client
2. **Replace JWT sessions** with Supabase sessions table
3. **Add RLS policies** in Supabase dashboard
4. **Set up workspace management** with the workspaces table

## Rollback (if needed)

```bash
# Remove from .env
vim .env  # Delete SUPABASE_* lines

# Remove generated files
rm lib/supabase/iam.ts lib/supabase/iam-types.ts

# Restart staging
pm2 restart alive-staging
```

## Support

For questions about:
- **IAM client usage**: See `lib/supabase/EXAMPLE.md`
- **Type generation**: See `lib/supabase/README.md`
- **Supabase config**: See `.env` (server vars) or env schema files

---

**Status**: ✅ Ready for IAM implementation
**Tested on**: Staging environment
**Production deployment**: Pending
