/**
 * User management service - pure, testable functions
 */

export interface CreateUserRequest {
  email: string
  password: string
  displayName?: string
  orgType: "new" | "existing"
  orgId?: string
  orgName?: string
}

export async function createUser(data: CreateUserRequest): Promise<any> {
  const response = await fetch("/api/manager/users/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const errorData = await response.json()
    throw new Error(errorData.message || "Failed to create user")
  }

  return response.json()
}
