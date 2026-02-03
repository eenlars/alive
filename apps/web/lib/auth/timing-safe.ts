/**
 * Timing-Safe String Comparison
 *
 * Prevents timing attacks by ensuring comparison takes constant time
 * regardless of how many characters match
 *
 * SECURITY: Standard === comparison is vulnerable to timing attacks
 * Attacker can measure response time to deduce characters one by one
 */

import { timingSafeEqual } from "node:crypto"

/**
 * Compare two strings in constant time
 * @param a First string
 * @param b Second string
 * @returns true if strings match, false otherwise
 */
export function timingSafeCompare(a: string, b: string): boolean {
  // Ensure both strings are defined
  if (typeof a !== "string" || typeof b !== "string") {
    return false
  }

  // timingSafeEqual requires buffers of same length
  // If lengths differ, we still need constant-time comparison
  // to avoid leaking length information

  // Convert to buffers
  const bufferA = Buffer.from(a, "utf8")
  const bufferB = Buffer.from(b, "utf8")

  // If lengths are different, compare against a dummy buffer
  // to maintain constant time
  if (bufferA.length !== bufferB.length) {
    // Create dummy buffer of same length as bufferA
    const dummy = Buffer.alloc(bufferA.length)
    // Do the comparison anyway (will always be false)
    timingSafeEqual(bufferA, dummy)
    return false
  }

  // Lengths match, do timing-safe comparison
  try {
    return timingSafeEqual(bufferA, bufferB)
  } catch {
    // In case of any error, return false
    return false
  }
}
