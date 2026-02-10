/**
 * Browser-safe constants export
 *
 * This file re-exports only the constants from @webalive/shared
 * without any Node.js dependencies, making it safe to import
 * in client-side code and React Server Components.
 */

export { DEFAULTS, DOMAINS, PATHS, PORTS, SECURITY, TIMEOUTS } from "@webalive/shared"
