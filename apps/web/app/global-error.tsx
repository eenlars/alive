"use client"

import * as Sentry from "@sentry/nextjs"
import { useEffect } from "react"

/**
 * Global error boundary for the entire Next.js app.
 * Catches errors that escape all other boundaries.
 * Reports to Sentry automatically.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            fontFamily: "system-ui, sans-serif",
            padding: "2rem",
          }}
        >
          <h2 style={{ marginBottom: "1rem" }}>Something went wrong</h2>
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>
            An unexpected error occurred. The error has been reported.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
