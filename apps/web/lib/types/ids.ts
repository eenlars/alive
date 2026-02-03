/**
 * Shared ID types for tab management
 *
 * SINGLE SOURCE OF TRUTH: tabStore
 *
 * - TabId: Unique identifier for a tab, also used as the Claude conversation key
 * - TabGroupId: Groups related tabs together (shown as one item in sidebar)
 * - ConversationKey: Alias for TabId - the key used for Claude SDK sessions
 */

/** Unique tab identifier - also the Claude conversation/session key */
export type TabId = string

/** Groups related tabs together in the sidebar */
export type TabGroupId = string

/** The key used for Claude SDK conversations. Equal to TabId. */
export type ConversationKey = TabId
