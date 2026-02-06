// Main database types file
// Imports and re-exports generated schema types
// DO NOT EDIT MANUALLY - Run 'bun run gen:types' to regenerate

// Export common types from public schema (if available) or lockbox as fallback
export {
  CompositeTypes,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from "./public.generated"

import type { Database as AppDatabase } from "./app.generated"
import type { Database as IamDatabase } from "./iam.generated"
import type { Database as IntegrationsDatabase } from "./integrations.generated"
// Import Database types for renaming
import type { Database as LockboxDatabase } from "./lockbox.generated"
import type { Database as PublicDatabase } from "./public.generated"

// Re-export with schema-specific names
export type { LockboxDatabase }
export type { IntegrationsDatabase }
export type { IamDatabase }
export type { PublicDatabase }
export type { AppDatabase }

// Re-export the main Database type for backward compatibility
export type Database = PublicDatabase

// Export database client creators
export * from "./client"
