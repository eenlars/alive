/**
 * Shared test data constants for E2E tests
 *
 * Benefits:
 * - Single source of truth
 * - Easy to update
 * - Type-safe
 * - Self-documenting
 */

import { SECURITY, TEST_CONFIG, TIMEOUTS } from "@webalive/shared"

// Direct env check to avoid circular dependency with test-env.ts
const isRemote = process.env.TEST_ENV !== "local"

export const TEST_USER = {
  email: SECURITY.LOCAL_TEST.EMAIL,
  password: SECURITY.LOCAL_TEST.PASSWORD,
  workspace: `test.${TEST_CONFIG.EMAIL_DOMAIN}`,
} as const

export const TEST_MESSAGES = {
  simple: "Hello",
  greeting: "Hi there",
  question: "What can you help me with?",
  complex: "Build a todo app with React and TypeScript",
  protected: "Protected!",
} as const

/**
 * Test timeouts calibrated for parallel execution
 *
 * Rule of thumb: if a single test needs X seconds, budget 3X for parallel.
 * Remote environments (staging/production) need 2x longer due to:
 * 1. More workers (6 vs 4)
 * 2. Network latency
 * 3. Server load from other traffic
 *
 * @see docs/postmortems/2025-11-30-e2e-test-flakiness.md
 */
const TIMEOUT_MULTIPLIER = isRemote ? 2 : 1

export const TEST_TIMEOUTS = {
  /** Fast UI operations (button clicks, input fills) - should be instant */
  fast: TIMEOUTS.TEST.SHORT * TIMEOUT_MULTIPLIER, // 1s local, 2s remote

  /** Medium operations (API responses, DOM updates) */
  medium: TIMEOUTS.TEST.MEDIUM * TIMEOUT_MULTIPLIER, // 3s local, 6s remote

  /**
   * Slow operations (React hydration, workspace initialization)
   * This is the PRIMARY wait - put it first, then use fast/medium for confirmations
   */
  slow: 10_000 * TIMEOUT_MULTIPLIER, // 10s local, 20s remote

  /** Maximum timeout for any single assertion */
  max: 15_000 * TIMEOUT_MULTIPLIER, // 15s local, 30s remote
} as const

export const TEST_SELECTORS = {
  workspaceReady: '[data-testid="workspace-ready"]',
  workspaceLoading: '[data-testid="workspace-loading"]',
  /** Chat is ready to send messages (dexie session + tab initialized) */
  chatReady: '[data-chat-ready="true"]',
  messageInput: '[data-testid="message-input"]',
  sendButton: '[data-testid="send-button"]',
  stopButton: '[data-testid="stop-button"]',
  // Tab-related selectors
  tabBar: '[data-testid="tab-bar"]',
  addTabButton: '[data-testid="add-tab-button"]',
  toggleTabsButton: '[data-testid="toggle-tabs-button"]',
  newTabGroupButton: '[data-testid="new-tab-group-button"]',
  /** Use with string template: `[data-testid="tab-${tabId}"]` */
  tabPrefix: '[data-testid^="tab-"]',
  activeTab: '[data-active="true"]',
} as const

/**
 * Test workspace configuration
 * This workspace is created by genuine-setup.ts for genuine E2E tests
 */
export const TEST_WORKSPACE = {
  /** Physical path where test workspace is created */
  path: "/tmp/test-workspace",
  /** Workspace name used in API requests */
  name: `test.${TEST_CONFIG.EMAIL_DOMAIN}`,
} as const
