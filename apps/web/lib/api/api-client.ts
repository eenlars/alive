// lib/api/client.ts DO NOT CHANGE THIS FILE.
"use client"

import { ApiError, createClient } from "@alive-brug/alrighty"
import { apiSchemas } from "./schemas"

export { ApiError }

const client = createClient(apiSchemas)

export const getty = client.getty
export const postty = client.postty
export const putty = client.putty
export const patchy = client.patchy
export const delly = client.delly
