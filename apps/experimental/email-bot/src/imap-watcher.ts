import { ImapFlow } from "imapflow"
import { parseEmail } from "./email-parser.js"
import { checkLoopGuard, recordReply } from "./loop-guard.js"
import { resolveThreadId, getThreadHistory, getThreadDepth, storeMessage } from "./conversation.js"
import { triggerAutomation } from "./trigger.js"
import { sendReply } from "./smtp-sender.js"
import { AUTOMATION } from "./constants.js"
import type { EmailJob, ConversationMessage } from "./types.js"

// Read env lazily — dotenv loads after static imports resolve
function getImapHost(): string {
  return process.env.IMAP_HOST ?? "localhost"
}
function getImapPort(): number {
  return Number(process.env.IMAP_PORT ?? "993")
}

/** Active IMAP connections */
const connections = new Map<string, ImapFlow>()

/** Serialize message processing per mailbox to prevent duplicate replies */
const processingQueue = new Map<string, Promise<void>>()

/** Track watcher state for health checks */
export const watcherStatus = new Map<string, { connected: boolean; lastEvent: number; error?: string }>()

/**
 * Start IMAP IDLE watcher for one mailbox.
 * Reconnects automatically on disconnect.
 */
export async function startWatcher(job: EmailJob, password: string): Promise<void> {
  const email = job.emailAddress
  const mailbox = email.split("@")[0] ?? email

  watcherStatus.set(email, { connected: false, lastEvent: Date.now() })

  async function connect(): Promise<void> {
    // Close existing connection if any
    const existing = connections.get(email)
    if (existing) {
      try {
        await existing.logout()
      } catch {
        /* ignore */
      }
      connections.delete(email)
    }

    const client = new ImapFlow({
      host: getImapHost(),
      port: getImapPort(),
      secure: true,
      auth: { user: email, pass: password },
      logger: false,
      tls: { rejectUnauthorized: false }, // localhost self-signed
    })

    client.on("error", (err: Error) => {
      console.error(`[IMAP:${mailbox}] Error:`, err.message)
      watcherStatus.set(email, { connected: false, lastEvent: Date.now(), error: err.message })
    })

    client.on("close", () => {
      console.log(`[IMAP:${mailbox}] Connection closed, reconnecting in 5s...`)
      watcherStatus.set(email, { connected: false, lastEvent: Date.now() })
      connections.delete(email)
      setTimeout(() => {
        void connect().catch(console.error)
      }, 5000)
    })

    await client.connect()
    connections.set(email, client)
    watcherStatus.set(email, { connected: true, lastEvent: Date.now() })
    console.log(`[IMAP:${mailbox}] Connected, starting IDLE`)

    // Open INBOX and start listening
    const lock = await client.getMailboxLock("INBOX")
    try {
      // Listen for new messages
      client.on("exists", (data: { count: number; prevCount: number }) => {
        if (data.count > data.prevCount) {
          console.log(`[IMAP:${mailbox}] New message(s): ${data.prevCount} -> ${data.count}`)
          const prev = processingQueue.get(mailbox) ?? Promise.resolve()
          const next = prev
            .then(() => processNewMessages(client, job, password, mailbox, data.prevCount + 1, data.count))
            .catch(err => {
              console.error(`[IMAP:${mailbox}] Error processing messages:`, err)
            })
          processingQueue.set(mailbox, next)
        }
      })

      // IDLE loop — ImapFlow handles IDLE automatically when idle
      // We just need to keep the connection alive
      while (client.usable) {
        await client.idle()
      }
    } finally {
      lock.release()
    }
  }

  void connect().catch(err => {
    console.error(`[IMAP:${mailbox}] Initial connection failed:`, err)
    watcherStatus.set(email, { connected: false, lastEvent: Date.now(), error: String(err) })
    // Retry after delay
    setTimeout(() => {
      void connect().catch(console.error)
    }, 10000)
  })
}

/**
 * Fetch and process new messages by sequence number range.
 */
async function processNewMessages(
  client: ImapFlow,
  job: EmailJob,
  password: string,
  mailbox: string,
  fromSeq: number,
  toSeq: number,
): Promise<void> {
  for (let seq = fromSeq; seq <= toSeq; seq++) {
    try {
      const fetchResult = await client.fetchOne(String(seq), { source: true }, { uid: false })
      if (!fetchResult || !("source" in fetchResult) || !fetchResult.source) continue

      const email = await parseEmail(fetchResult.source)
      console.log(`[IMAP:${mailbox}] Processing: from=${email.from} subject="${email.subject}"`)

      await handleIncomingEmail(job, password, mailbox, email)
    } catch (err) {
      console.error(`[IMAP:${mailbox}] Failed to process message seq=${seq}:`, err)
    }
  }
}

/**
 * Handle a single incoming email:
 * 1. Loop guard check
 * 2. Resolve conversation thread
 * 3. Build prompt with history
 * 4. Trigger automation
 * 5. Send reply
 * 6. Store in SQLite
 */
async function handleIncomingEmail(
  job: EmailJob,
  password: string,
  mailbox: string,
  email: Awaited<ReturnType<typeof parseEmail>>,
): Promise<void> {
  // Resolve thread
  const threadId = resolveThreadId(mailbox, email.messageId, email.inReplyTo, email.references)
  const depth = getThreadDepth(mailbox, threadId)

  // Loop guard
  const guard = checkLoopGuard(email, depth)
  if (!guard.allowed) {
    console.log(`[IMAP:${mailbox}] Blocked by loop guard: ${guard.reason}`)
    return
  }

  // Store incoming message
  storeMessage(
    mailbox,
    threadId,
    email.messageId,
    email.inReplyTo,
    email.from,
    email.subject,
    email.textBody,
    "incoming",
  )

  // Get conversation history
  const history = getThreadHistory(mailbox, threadId)

  // Build the full prompt
  const fullPrompt = buildPrompt(job.actionPrompt, history, email)

  // Trigger automation
  const triggerContext = {
    type: "email",
    from: email.from,
    to: email.to,
    subject: email.subject,
    messageId: email.messageId,
    threadId,
    conversationDepth: history.length,
  }

  const result = await triggerAutomation(job.id, fullPrompt, triggerContext, {
    extraTools: [AUTOMATION.SEND_REPLY],
    responseToolName: AUTOMATION.SEND_REPLY_BARE,
  })

  if (!result.ok || !result.response) {
    console.error(`[IMAP:${mailbox}] Trigger failed: ${result.error}`)
    return
  }

  // Send reply — use character name from job as display name
  const displayName = job.name.replace(/\s*Email\s*Bot$/i, "")
  const replyMessageId = await sendReply({
    from: `"${displayName}" <${job.emailAddress}>`,
    fromPassword: password,
    to: email.from,
    subject: email.subject,
    text: result.response,
    inReplyTo: email.messageId,
    references: email.references,
  })

  // Store outgoing message
  storeMessage(
    mailbox,
    threadId,
    replyMessageId,
    email.messageId,
    job.emailAddress,
    email.subject,
    result.response,
    "outgoing",
  )

  // Record for rate limiting
  recordReply(email.from)

  watcherStatus.set(job.emailAddress, { connected: true, lastEvent: Date.now() })
  console.log(`[IMAP:${mailbox}] Reply sent to ${email.from}`)
}

/**
 * Build the full prompt for Claude, including character personality + conversation history + new email.
 */
function buildPrompt(
  characterPrompt: string,
  history: ConversationMessage[],
  newEmail: Awaited<ReturnType<typeof parseEmail>>,
): string {
  const parts: string[] = []

  // Character personality / system context
  parts.push(characterPrompt)

  // Conversation history (if any previous messages)
  if (history.length > 0) {
    parts.push("\n--- Conversation History ---")
    for (const msg of history) {
      const label = msg.direction === "incoming" ? `[From: ${msg.sender}]` : "[You replied]"
      parts.push(`${label}\n${msg.body}`)
    }
    parts.push("--- End History ---\n")
  }

  // New incoming email
  parts.push(`New email from ${newEmail.from}:`)
  parts.push(`Subject: ${newEmail.subject}`)
  parts.push(`\n${newEmail.textBody}`)
  parts.push(
    "\nCompose your reply and send it using the send_reply tool. Be concise and in-character. Do NOT include a subject line or email headers — just the body text.",
  )

  return parts.join("\n")
}

/**
 * Stop all IMAP watchers gracefully.
 */
export async function stopAllWatchers(): Promise<void> {
  for (const [email, client] of connections) {
    console.log(`[IMAP] Closing connection for ${email}`)
    try {
      await client.logout()
    } catch {
      /* ignore */
    }
  }
  connections.clear()
}
