"use client"

import React from "react"
import { captureException } from "@/components/providers/PostHogProvider"

interface Props {
  children: React.ReactNode
  messageId: string
}

interface State {
  hasError: boolean
  error?: Error
}

export class MessageErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Message render error:", {
      messageId: this.props.messageId,
      error,
      errorInfo,
      componentStack: errorInfo.componentStack,
    })
    captureException(error, {
      $exception_source: "message_error_boundary",
      messageId: this.props.messageId,
      componentStack: errorInfo.componentStack,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="border border-red-200 bg-red-50/50 p-3 rounded my-2">
          <div className="flex items-start gap-2">
            <svg
              className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>

            <div className="text-sm flex-1">
              <p className="text-red-900 font-medium mb-1">Failed to render message</p>
              <p className="text-red-700 text-xs">
                This message contains data that couldn't be displayed. The conversation will continue normally.
              </p>

              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-2">
                  <summary className="text-xs text-red-600 cursor-pointer hover:text-red-800">
                    Error details (development only)
                  </summary>
                  <pre className="mt-1 text-xs bg-red-100 p-2 rounded overflow-auto max-h-32">
                    {this.state.error.message}
                    {"\n\n"}
                    {this.state.error.stack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
