/**
 * Centralized URL query parameter keys.
 * Use these constants with useQueryState from nuqs to ensure consistency.
 *
 * @example
 * import { useQueryState } from "nuqs"
 * import { QUERY_KEYS } from "@/lib/url/queryState"
 *
 * const [tab, setTab] = useQueryState(QUERY_KEYS.chatTab)
 */
export const QUERY_KEYS = {
  chatTab: "tab",
  workspace: "wk",
  settingsTab: "settingsTab",
} as const

export type QueryKey = (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS]
