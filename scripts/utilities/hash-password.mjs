#!/usr/bin/env node
import bcrypt from "bcrypt"

const SALT_ROUNDS = 12

const password = process.argv[2]

if (!password) {
  console.error('Usage: bun hash-password.mjs "password"')
  process.exit(1)
}

try {
  const hash = await bcrypt.hash(password, SALT_ROUNDS)
  console.log(hash)
} catch (error) {
  console.error("Error:", error.message)
  process.exit(1)
}
