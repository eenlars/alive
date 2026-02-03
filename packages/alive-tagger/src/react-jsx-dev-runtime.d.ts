/**
 * Type declarations for react/jsx-dev-runtime
 *
 * React 19 doesn't ship with types for this module in @types/react,
 * so we declare them here based on the actual exports.
 */

declare module "react/jsx-dev-runtime" {
  import type * as React from "react"

  export const Fragment: React.ExoticComponent<{ children?: React.ReactNode }>

  export function jsxDEV(
    type: React.ElementType,
    props: Record<string, unknown> | null,
    key: React.Key | undefined,
    isStatic: boolean,
    source:
      | {
          fileName?: string
          lineNumber?: number
          columnNumber?: number
        }
      | undefined,
    self: unknown,
  ): React.ReactElement
}
