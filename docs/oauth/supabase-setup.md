# Supabase Integration

Production-ready Supabase setup with security, type safety, and RLS enforcement.

## Setup

### 1. Environment Variables

Add to `.env.local`:

```bash
# Server-only (private)
SUPABASE_URL=https://yourproject.supabase.co
SUPABASE_PROJECT_ID=yourproject
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Optional: admin only

# Browser-safe (public)
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

### 2. Generate Database Types

```bash
npx supabase login
bun run gen:db
```

## Usage

### Browser Client

```typescript
import { createClient } from "@/lib/supabase/client"

const supabase = createClient()
const { data } = await supabase.from("profiles").select("*")
```

### Server with RLS (Recommended)

```typescript
import { createRLSClient } from "@/lib/supabase/server-rls"

const supabase = await createRLSClient()
const { data } = await supabase.from("workflows").select("*")
```

### Server Admin

```typescript
import { createClient } from "@/lib/supabase/server"

const supabase = await createClient("service")
const { data } = await supabase.from("admin_logs").insert({ action: "cleanup" })
```

## Client Types

| Client | Use Case | Key | RLS |
|--------|----------|-----|-----|
| `client.ts` | Browser | Anon | ✅ |
| `server-rls.ts` | User-scoped | Anon + JWT | ✅ |
| `server.ts` (anon) | Server | Anon | ✅ |
| `server.ts` (service) | Admin | Service | ❌ |

## RLS with Alive JWT

Configure Supabase to accept Alive JWT:
1. Project Settings → Authentication → JWT Settings
2. Set JWT Secret to match your `JWT_SECRET`

Example RLS policy:

```sql
CREATE POLICY "workspace_access"
ON workflows
FOR SELECT
USING (workspace = ANY((auth.jwt() -> 'workspaces')::text[]));
```

## File Structure

```
lib/
├── env/
│   ├── schema.ts     # Zod validation
│   ├── client.ts     # Browser env
│   └── server.ts     # Server env
├── supabase/
│   ├── client.ts     # Browser client
│   ├── server.ts     # Server client
│   ├── server-rls.ts # RLS client
│   └── types.ts      # Generated types
└── providers/
    └── SupabaseAuthBridge.tsx
```

## Notes

- Types auto-generate on build via `prebuild` script
- Browser client uses anon key only
- Service key bypasses RLS - use sparingly
- Commit generated types for CI/CD
