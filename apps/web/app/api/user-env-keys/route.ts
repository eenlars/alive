/**
 * User Environment Keys API
 *
 * Manages user-defined environment keys stored in the lockbox.
 * These keys can be used by MCP servers for custom API integrations.
 *
 * POST - Create/update an env key
 * GET - List env key names (without values for security)
 * DELETE - Remove an env key
 */

import { type NextRequest, NextResponse } from "next/server"
import { getUserEnvKeysManager } from "@/lib/oauth/oauth-instances"
import { z } from "zod"
import { createErrorResponse, getSessionUser } from "@/features/auth/lib/auth"
import { ErrorCodes } from "@/lib/error-codes"

/**
 * Schema for creating/updating an env key
 */
const CreateEnvKeySchema = z.object({
  keyName: z
    .string()
    .min(1, "Key name is required")
    .max(100, "Key name too long")
    .regex(
      /^[A-Z][A-Z0-9_]*$/,
      "Key name must be uppercase, start with a letter, and contain only letters, numbers, and underscores",
    ),
  keyValue: z.string().min(1, "Key value is required").max(10000, "Key value too long"),
})

/**
 * Schema for deleting an env key
 */
const DeleteEnvKeySchema = z.object({
  keyName: z.string().min(1, "Key name is required"),
})

/**
 * POST - Create or update an environment key
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    // 2. Parse and validate request body
    const body = await req.json()
    const parseResult = CreateEnvKeySchema.safeParse(body)

    if (!parseResult.success) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        field: parseResult.error.issues[0]?.path.join(".") || "unknown",
        message: parseResult.error.issues[0]?.message,
      })
    }

    const { keyName, keyValue } = parseResult.data

    // 3. Check if this is a reserved key name
    const RESERVED_KEYS = ["ANTHROPIC_API_KEY", "ANTH_API_SECRET", "JWT_SECRET", "LOCKBOX_MASTER_KEY"]
    if (RESERVED_KEYS.includes(keyName)) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        field: "keyName",
        message: `${keyName} is a reserved key name and cannot be set by users`,
      })
    }

    // 4. Save the key
    await getUserEnvKeysManager().setUserEnvKey(user.id, keyName, keyValue)

    console.log(`[User Env Keys] User ${user.id} set key: ${keyName}`)

    return NextResponse.json({
      ok: true,
      message: `Environment key '${keyName}' saved successfully`,
      keyName,
    })
  } catch (error) {
    console.error("[User Env Keys] Failed to save key:", error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      reason: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

/**
 * GET - List environment key names (values are not returned for security)
 */
export async function GET() {
  try {
    // 1. Authenticate user
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    // 2. Get list of key names
    const keyNames = await getUserEnvKeysManager().listUserEnvKeyNames(user.id)

    return NextResponse.json({
      ok: true,
      keys: keyNames.map(name => ({
        name,
        // Indicate that we have a value but don't expose it
        hasValue: true,
      })),
    })
  } catch (error) {
    console.error("[User Env Keys] Failed to list keys:", error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      reason: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

/**
 * DELETE - Remove an environment key
 */
export async function DELETE(req: NextRequest) {
  try {
    // 1. Authenticate user
    const user = await getSessionUser()
    if (!user) {
      return createErrorResponse(ErrorCodes.UNAUTHORIZED, 401)
    }

    // 2. Parse and validate request body
    const body = await req.json()
    const parseResult = DeleteEnvKeySchema.safeParse(body)

    if (!parseResult.success) {
      return createErrorResponse(ErrorCodes.INVALID_REQUEST, 400, {
        field: parseResult.error.issues[0]?.path.join(".") || "unknown",
        message: parseResult.error.issues[0]?.message,
      })
    }

    const { keyName } = parseResult.data

    // 3. Delete the key
    await getUserEnvKeysManager().deleteUserEnvKey(user.id, keyName)

    console.log(`[User Env Keys] User ${user.id} deleted key: ${keyName}`)

    return NextResponse.json({
      ok: true,
      message: `Environment key '${keyName}' deleted successfully`,
      keyName,
    })
  } catch (error) {
    console.error("[User Env Keys] Failed to delete key:", error)
    return createErrorResponse(ErrorCodes.INTERNAL_ERROR, 500, {
      reason: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
