import type { Route } from "@playwright/test"
import { ErrorCodes } from "@/lib/error-codes"
import { StreamBuilder } from "./stream-builder"

interface HandlerOptions {
  delay?: number
  fail?: boolean
  errorMessage?: string
}

function createStreamHandler(builder: StreamBuilder, options: HandlerOptions = {}) {
  return async (route: Route) => {
    const { delay = 0, fail = false, errorMessage } = options

    if (delay) {
      await new Promise(r => setTimeout(r, delay))
    }

    if (fail) {
      const errorStream = new StreamBuilder()
        .start()
        .error(errorMessage || "Internal error")
        .toNDJSON()

      await route.fulfill({
        status: 200,
        contentType: "application/x-ndjson; charset=utf-8",
        body: errorStream,
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
      body: builder.toNDJSON(),
    })
  }
}

export const handlers = {
  text: (message: string, options?: HandlerOptions) =>
    createStreamHandler(new StreamBuilder().start().text(message).complete(), options),

  withThinking: (thinking: string, response: string, options?: HandlerOptions) =>
    createStreamHandler(new StreamBuilder().start().thinking(thinking).text(response).complete(), options),

  fileRead: (path: string, content: string, response: string, options?: HandlerOptions) =>
    createStreamHandler(
      new StreamBuilder().start().tool("Read", { file_path: path }, content).text(response).complete(),
      options,
    ),

  fileWrite: (path: string, content: string, response: string, options?: HandlerOptions) =>
    createStreamHandler(
      new StreamBuilder().start().tool("Write", { file_path: path, content }, "File written").text(response).complete(),
      options,
    ),

  fileEdit: (path: string, oldString: string, newString: string, response: string, options?: HandlerOptions) =>
    createStreamHandler(
      new StreamBuilder()
        .start()
        .tool("Edit", { file_path: path, old_string: oldString, new_string: newString }, "File edited successfully")
        .text(response)
        .complete(),
      options,
    ),

  conversation: (messages: string[], options?: HandlerOptions) => {
    const builder = new StreamBuilder().start()
    for (const msg of messages) {
      builder.text(msg)
    }
    return createStreamHandler(builder.complete({ totalTurns: messages.length }), options)
  },

  custom: (builder: StreamBuilder, options?: HandlerOptions) => createStreamHandler(builder, options),

  error: (message: string, options?: HandlerOptions) =>
    createStreamHandler(new StreamBuilder().start().error(message), {
      ...options,
      fail: true,
      errorMessage: message,
    }),

  maxTurns: (options?: HandlerOptions) =>
    createStreamHandler(
      new StreamBuilder()
        .start()
        .error("Conversation reached maximum turn limit (25/25 turns)", ErrorCodes.ERROR_MAX_TURNS),
      { ...options, fail: true },
    ),

  timeout: (options?: HandlerOptions) =>
    createStreamHandler(new StreamBuilder().start().error("Request timeout", ErrorCodes.QUERY_FAILED), {
      ...options,
      fail: true,
    }),
}
