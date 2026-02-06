/**
 * Queue Definitions
 *
 * Central registry of all pg-boss queues with their configurations.
 */

import type PgBoss from "pg-boss"

/**
 * Queue name constants.
 */
export const QUEUES = {
  /** Runs automation jobs (replaces CronService execution) */
  RUN_AUTOMATION: "run-automation",
  /** Dead letter queue for failed automations */
  AUTOMATION_FAILED: "automation-failed",
  /** Resumes a conversation after a delay */
  RESUME_CONVERSATION: "resume-conversation",
  /** Dead letter queue for failed resumptions */
  RESUME_FAILED: "resume-failed",
} as const

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]

/**
 * Queue configurations for createQueue().
 *
 * These define retry behavior, expiry, and dead letter routing.
 */
/**
 * Queue creation order matters: dead letter queues must exist
 * before queues that reference them (foreign key constraint).
 */
export const QUEUE_CONFIGS: Array<PgBoss.Queue & { name: QueueName }> = [
  // Dead letter queues first
  { name: QUEUES.AUTOMATION_FAILED, retryLimit: 0 },
  { name: QUEUES.RESUME_FAILED, retryLimit: 0 },
  // Main queues (reference dead letter queues)
  {
    name: QUEUES.RUN_AUTOMATION,
    policy: "short", // singletonKey dedup: only one created job per key
    retryLimit: 3,
    retryDelay: 60, // 1 minute between retries
    retryBackoff: true, // exponential backoff
    expireInSeconds: 3600, // 1 hour max per automation run
    deadLetter: QUEUES.AUTOMATION_FAILED,
  },
  {
    name: QUEUES.RESUME_CONVERSATION,
    retryLimit: 3,
    retryDelay: 30, // 30 seconds between retries
    retryBackoff: true,
    expireInSeconds: 600, // 10 min max per resume attempt
    deadLetter: QUEUES.RESUME_FAILED,
  },
]
