# Supabase IAM Usage Example

## Basic Query

```typescript
import { createIamClient, type IamUser } from "@/lib/supabase/iam"

export async function GET() {
  const iam = await createIamClient("service")
  
  const { data: users, error } = await iam
    .from("users")
    .select("*")
  
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  
  return Response.json({ users })
}
```

## Find User by Email

```typescript
import { createIamClient, type IamUser } from "@/lib/supabase/iam"

export async function findUserByEmail(email: string): Promise<IamUser | null> {
  const iam = await createIamClient("service")
  
  const { data: user, error } = await iam
    .from("users")
    .select("*")
    .eq("email", email)
    .single()
  
  if (error) {
    if (error.code === "PGRST116") {
      return null // Not found
    }
    throw error
  }
  
  return user
}
```

## Create User

```typescript
import { createIamClient, type IamUserInsert, type IamUser } from "@/lib/supabase/iam"

export async function createUser(email: string, name?: string): Promise<IamUser> {
  const iam = await createIamClient("service")
  
  const newUser: IamUserInsert = {
    email,
    name: name || null,
  }
  
  const { data, error } = await iam
    .from("users")
    .insert(newUser)
    .select()
    .single()
  
  if (error) throw error
  
  return data
}
```

## Session Management

```typescript
import { createIamClient, type IamSessionInsert, type IamSession } from "@/lib/supabase/iam"
import { randomBytes } from "crypto"

export async function createSession(userId: string): Promise<IamSession> {
  const iam = await createIamClient("service")
  
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  
  const session: IamSessionInsert = {
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
  }
  
  const { data, error } = await iam
    .from("sessions")
    .insert(session)
    .select()
    .single()
  
  if (error) throw error
  
  return data
}

export async function validateSession(token: string): Promise<IamSession | null> {
  const iam = await createIamClient("service")
  
  const { data: session, error } = await iam
    .from("sessions")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single()
  
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }
  
  return session
}
```

## Workspace Management

```typescript
import { createIamClient, type IamWorkspaceInsert, type IamWorkspace } from "@/lib/supabase/iam"

export async function createWorkspace(
  name: string,
  ownerId: string
): Promise<IamWorkspace> {
  const iam = await createIamClient("service")
  
  const workspace: IamWorkspaceInsert = {
    name,
    owner_id: ownerId,
  }
  
  const { data, error } = await iam
    .from("workspaces")
    .insert(workspace)
    .select()
    .single()
  
  if (error) throw error
  
  return data
}

export async function getUserWorkspaces(userId: string): Promise<IamWorkspace[]> {
  const iam = await createIamClient("service")
  
  const { data: workspaces, error } = await iam
    .from("workspaces")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
  
  if (error) throw error
  
  return workspaces || []
}
```

## Join Queries (with User + Session)

```typescript
import { createIamClient } from "@/lib/supabase/iam"

export async function getSessionWithUser(token: string) {
  const iam = await createIamClient("service")
  
  const { data, error } = await iam
    .from("sessions")
    .select(`
      *,
      users (
        id,
        email,
        name
      )
    `)
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single()
  
  if (error) {
    if (error.code === "PGRST116") return null
    throw error
  }
  
  return data
}
```

## Error Handling

```typescript
import { createIamClient } from "@/lib/supabase/iam"
import { PostgrestError } from "@supabase/supabase-js"

export async function safeQuery(email: string) {
  try {
    const iam = await createIamClient("service")
    
    const { data, error } = await iam
      .from("users")
      .select("*")
      .eq("email", email)
      .single()
    
    if (error) {
      // Handle specific Postgres errors
      switch (error.code) {
        case "PGRST116":
          return { user: null, error: "User not found" }
        case "23505":
          return { user: null, error: "Email already exists" }
        default:
          console.error("Database error:", error)
          return { user: null, error: "Database error" }
      }
    }
    
    return { user: data, error: null }
  } catch (err) {
    console.error("Unexpected error:", err)
    return { user: null, error: "Internal error" }
  }
}
```
