import nodemailer from "nodemailer"
import { randomUUID } from "node:crypto"

// Read env lazily — dotenv loads after static imports resolve
function getSmtpHost(): string {
  return process.env.SMTP_HOST ?? "localhost"
}
function getSmtpPort(): number {
  return Number(process.env.SMTP_PORT ?? "587")
}

/** Transporter cache per mailbox (user@domain -> transporter) */
const transporters = new Map<string, nodemailer.Transporter>()

/**
 * Get or create an SMTP transporter for a mailbox.
 */
function getTransporter(email: string, password: string): nodemailer.Transporter {
  const existing = transporters.get(email)
  if (existing) return existing

  const transporter = nodemailer.createTransport({
    host: getSmtpHost(),
    port: getSmtpPort(),
    secure: false, // STARTTLS on 587
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false }, // localhost self-signed
  })

  transporters.set(email, transporter)
  return transporter
}

export interface SendReplyOptions {
  /** Display name + address, e.g. '"Dweil" <dweil@mail.alive.best>' or just 'dweil@mail.alive.best' */
  from: string
  fromPassword: string
  to: string
  subject: string
  text: string
  inReplyTo: string
  references: string[]
}

/** Extract bare email from display name format: '"Name" <user@host>' -> 'user@host' */
function bareEmail(from: string): string {
  const match = from.match(/<([^>]+)>/)
  return match ? match[1] : from
}

/**
 * Send a reply email with proper threading headers.
 * Returns the generated Message-ID.
 */
export async function sendReply(opts: SendReplyOptions): Promise<string> {
  const email = bareEmail(opts.from)
  const transporter = getTransporter(email, opts.fromPassword)

  // Generate a Message-ID
  const domain = email.split("@")[1] ?? "mail.alive.best"
  const messageId = `<${randomUUID()}@${domain}>`

  // Build References header: previous references + In-Reply-To
  const references = [...opts.references]
  if (opts.inReplyTo && !references.includes(opts.inReplyTo)) {
    references.push(opts.inReplyTo)
  }

  await transporter.sendMail({
    from: opts.from,
    to: opts.to,
    subject: opts.subject.startsWith("Re:") ? opts.subject : `Re: ${opts.subject}`,
    text: opts.text,
    messageId,
    inReplyTo: opts.inReplyTo,
    references: references.join(" "),
    headers: {
      "X-Auto-Response-Suppress": "OOF, AutoReply",
    },
  })

  console.log(`[SMTP] Sent reply from ${opts.from} to ${opts.to} (${messageId})`)
  return messageId
}
