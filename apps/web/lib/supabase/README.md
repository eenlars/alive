# Supabase Clients

Type-safe Supabase clients for Alive.

## Client Types

### 1. Public Schema Client (`lib/supabase/server.ts` & `lib/supabase/client.ts`)

For general-purpose tables in the `public` schema.

**Server-side:**
```typescript
import { createClient } from "@/lib/supabase/server"

// In API routes or Server Components
const supabase = await createClient("anon") // RLS-protected
const supabase = await createClient("service") // Bypass RLS (admin)
```

**Client-side:**
```typescript
import { createClient } from "@/lib/supabase/client"

// In React components
const supabase = createClient()
```

### 2. IAM Schema Client (`lib/supabase/iam.ts`)

For identity and access management (users, sessions, workspaces).

**Server-side only:**
```typescript
import { createIamClient } from "@/lib/supabase/iam"
import type { IamUser, IamSession, IamWorkspace } from "@/lib/supabase/iam"

// Query users
const iam = await createIamClient("service")
const { data: users } = await iam.from("users").select("*")

// Type-safe operations
const { data: user } = await iam
  .from("users")
  .select("*")
  .eq("email", "user@example.com")
  .single()

// Insert with types
const newUser: IamUserInsert = {
  email: "new@example.com",
  name: "New User",
}
const { data } = await iam.from("users").insert(newUser).select().single()
```

## Type Generation

### Update All Schema Types

When you change any schema in Supabase:

```bash
bun run gen:db        # Generates types for all schemas (with 2h cooldown)
bun run gen:db:force  # Force regeneration (skips cooldown)
```

This regenerates:
- `lib/supabase/public.types.ts` - Public schema
- `lib/supabase/iam.types.ts` - IAM schema

**Features:**
- ✅ 2-hour cooldown to avoid excessive API calls
- ✅ Automatic fallback templates when CLI auth unavailable
- ✅ CI/Vercel detection (uses committed types)
- ✅ Constants export fix applied automatically

## Security Notes

- **IAM client is server-only** - importing in client code throws an error
- **Default to service role** - IAM operations typically need admin access
- **Use anon key for RLS** - when you want Row Level Security enforcement

## File Structure

```
lib/supabase/
├── server.ts             # Server-side public schema client
├── server-rls.ts         # RLS-specific utilities (if needed)
├── client.ts             # Client-side public schema client
├── iam.ts                # Server-side IAM schema client
├── public.types.ts       # Generated public schema types
├── iam.types.ts          # Generated IAM schema types
├── README.md             # Documentation
├── EXAMPLE.md            # Usage examples
└── SETUP_COMPLETE.md     # Setup verification
```
