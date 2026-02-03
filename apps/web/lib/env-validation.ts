/**
 * Environment Variable Validation - Server Only
 *
 * This file is imported by app/layout.tsx to trigger build-time validation.
 * It ensures missing environment variables fail the build immediately.
 *
 * DO NOT import this file in client code.
 */

import { env } from "@webalive/env/server"

// Re-export for convenience
export { env }

// The import above triggers validation when this module is loaded
// This happens during Next.js static analysis, which runs during:
// - next build (production builds)
// - next dev (development server)
//
// By importing in layout.tsx (the root server component), we ensure
// validation runs before the app can start serving requests.
