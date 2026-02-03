# IAM Schema Documentation

**Generated**: 2025-11-14
**Schema**: `iam`

## Tables

### `users`
User accounts in the system.

**Columns** (generated types in `iam.types.ts`):
- Uses Clerk for authentication (`clerk_id`)
- Status tracking via `user_status` enum

### `orgs`
Organizations (multi-tenant support).

**Columns** (generated types in `iam.types.ts`):
- Organization identification
- Relationships to users via memberships

### `org_memberships`
User-organization relationships with roles.

**Columns**:
- `clerk_id` (FK → users)
- `org_id` (FK → orgs)
- `role` (string, likely maps to org_role enum)
- `created_at`

### `org_invites`
Pending organization invitations.

**Columns**:
- `invite_id` (UUID)
- `org_id` (FK → orgs)
- `email` (invitee email)
- `token` (invitation token)
- `role` (org_role enum)
- `invited_by` (FK → users.clerk_id, nullable)
- `expires_at` (timestamp)
- `accepted_at` (timestamp, nullable)
- `created_at`

## Enums

### `org_role`
```typescript
type OrgRole = "owner" | "admin" | "member"
```

Defines organization membership roles:
- **owner**: Full control, can delete org
- **admin**: Manage members and settings
- **member**: Basic access

### `user_status`
```typescript
type UserStatus = "active" | "disabled" | "invited"
```

User account status:
- **active**: Normal active user
- **disabled**: Account disabled (can't login)
- **invited**: Pending invitation acceptance

## Usage Examples

### Query Users
```typescript
import { createIamClient, type IamUser } from "@/lib/supabase/iam"

const iam = await createIamClient("service")
const { data: users } = await iam.from("users").select("*")
```

### Get Organization with Members
```typescript
const { data: org } = await iam
  .from("orgs")
  .select(`
    *,
    org_memberships (
      clerk_id,
      role,
      users (clerk_id, email, name)
    )
  `)
  .eq("org_id", orgId)
  .single()
```

### Create Organization Invite
```typescript
import { createIamClient, type IamOrgInviteInsert } from "@/lib/supabase/iam"

const iam = await createIamClient("service")

const invite: IamOrgInviteInsert = {
  org_id: "org_123",
  email: "newuser@example.com",
  role: "member",
  token: generateToken(),
  expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  invited_by: currentUserClerkId,
}

const { data } = await iam
  .from("org_invites")
  .insert(invite)
  .select()
  .single()
```

### Check User Organization Membership
```typescript
const { data: membership } = await iam
  .from("org_memberships")
  .select("*, orgs(*)")
  .eq("clerk_id", userClerkId)
  .eq("org_id", orgId)
  .single()

if (membership?.role === "owner") {
  // User is org owner
}
```

## Type Exports

All types are exported from `lib/supabase/iam.ts`:

```typescript
// Tables
IamUser
IamOrg
IamOrgMembership
IamOrgInvite

// Insert types
IamUserInsert
IamOrgInsert
IamOrgMembershipInsert
IamOrgInviteInsert

// Update types
IamUserUpdate
IamOrgUpdate
IamOrgMembershipUpdate
IamOrgInviteUpdate

// Enums
IamOrgRole
IamUserStatus
```

## Regeneration

When the IAM schema changes in Supabase:

```bash
bun run gen:db        # Respects 2h cooldown
bun run gen:db:force  # Force regeneration
```

## Notes

- **Clerk Integration**: Uses `clerk_id` for user identification
- **Multi-tenant**: Designed for organization-based multi-tenancy
- **Invite System**: Token-based invitations with expiration
- **Role-based Access**: Three-tier role system (owner/admin/member)
