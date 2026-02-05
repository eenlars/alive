/**
 * Workspace Schema - Versioned directory structure
 *
 * Every site workspace MUST conform to this schema.
 * Bump WORKSPACE_SCHEMA_VERSION when adding/removing directories.
 * Add a migration entry in WORKSPACE_MIGRATIONS for each version bump.
 */

export const WORKSPACE_SCHEMA_VERSION = 1

/** Required directories within every workspace (relative to workspace root) */
export const WORKSPACE_DIRS = {
  /** Platform metadata root */
  ALIVE_ROOT: ".alive",
  /** User work files — publicly served at domain.com/files/* */
  FILES: ".alive/files",
} as const

export type WorkspaceDir = (typeof WORKSPACE_DIRS)[keyof typeof WORKSPACE_DIRS]

/** Schema version file location (relative to workspace root) */
export const WORKSPACE_SCHEMA_VERSION_FILE = ".alive/.schema-version" as const

/**
 * Migration definitions. Each migration describes what changed.
 * Applied sequentially from current version to WORKSPACE_SCHEMA_VERSION.
 */
export const WORKSPACE_MIGRATIONS = [
  {
    version: 1,
    description: "Add .alive/files directory for user work files",
    directories: [".alive", ".alive/files"],
  },
] as const satisfies readonly WorkspaceMigration[]

export interface WorkspaceMigration {
  readonly version: number
  readonly description: string
  /** Directories to create (relative to workspace root) */
  readonly directories: readonly string[]
}

/** Get all directories that should exist for a given schema version */
export function getRequiredDirectories(version: number = WORKSPACE_SCHEMA_VERSION): string[] {
  return WORKSPACE_MIGRATIONS.filter(m => m.version <= version).flatMap(m => [...m.directories])
}
