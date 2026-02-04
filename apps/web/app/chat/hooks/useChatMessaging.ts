"use client"

import { isRetryableNetworkError, retryAsync } from "@webalive/shared"
import { useCallback, useRef } from "react"
import toast from "react-hot-toast"
import type { ChatInputHandle } from "@/features/chat/components/ChatInput/types"
import { ClientError, ClientRequest, useDevTerminal } from "@/features/chat/lib/dev-terminal-context"
import { type AgentManagerContent, parseStreamEvent, type UIMessage } from "@/features/chat/lib/message-parser"
import { sendClientError } from "@/features/chat/lib/send-client-error"
import { isValidStreamEvent } from "@/features/chat/lib/stream-guards"
import { type BridgeWarningContent, isWarningMessage } from "@/features/chat/lib/streaming/ndjson"
import { isCompleteEvent, isDoneEvent, isErrorEvent, isInterruptEvent } from "@/features/chat/types/stream"
import { formatMessagesAsText } from "@/features/chat/utils/format-messages"
import { buildPromptWithAttachmentsEx, type PromptBuildResult } from "@/features/chat/utils/prompt-builder"
import { useDexieMessageStore } from "@/lib/db/dexieMessageStore"
import { toUIMessage } from "@/lib/db/messageAdapters"
import { getMessageDb } from "@/lib/db/messageDb"
import type { StructuredError } from "@/lib/error-codes"
import { ErrorCodes, getErrorHelp, getErrorMessage } from "@/lib/error-codes"
import { HttpError } from "@/lib/errors"
import { authStore } from "@/lib/stores/authStore"
import { isDevelopment } from "@/lib/stores/debug-store"
import { useFeatureFlag } from "@/lib/stores/featureFlagStore"
import { useBuilding, useGoal, useTargetUsers } from "@/lib/stores/goalStore"
import { useApiKey, useModel } from "@/lib/stores/llmStore"
import { getPlanModeState, usePlanMode } from "@/lib/stores/planModeStore"
import { clearAbortController, setAbortController, useStreamingActions } from "@/lib/stores/streamingStore"
import { useActiveTab } from "@/lib/stores/tabStore"

interface UseChatMessagingOptions {
  workspace: string | null
  /** Tab ID — also the Claude conversation key */
  tabId: string | null
  /** Tab group ID — required for lock key */
  tabGroupId: string | null
  isTerminal: boolean
  busy: boolean
  msg: string
  setMsg: (msg: string) => void
  addMessage: (message: UIMessage, targetTabId: string) => void
  chatInputRef: React.RefObject<ChatInputHandle | null>
  /** Force scroll to bottom when user sends a message */
  forceScrollToBottom: () => void
  setShowCompletionDots: (value: boolean) => void
}

/**
 * Hook that encapsulates all chat messaging logic:
 * - sendMessage, sendStreaming
 * - Agent supervisor (handleCompletionFeatures)
 * - Request abort controllers and refs
 *
 * Extracts ~450 lines from page.tsx into a focused, testable unit.
 */
export function useChatMessaging({
  workspace,
  tabId,
  tabGroupId,
  isTerminal,
  busy,
  msg,
  setMsg,
  addMessage,
  chatInputRef,
  forceScrollToBottom,
  setShowCompletionDots,
}: UseChatMessagingOptions) {
  // Refs for request management
  const abortControllerRef = useRef<AbortController | null>(null)
  const currentRequestIdRef = useRef<string | null>(null)
  // Per-tab submission tracking to prevent double-clicks (Map<tabId, boolean>)
  const isSubmittingByTab = useRef<Map<string, boolean>>(new Map())
  const agentManagerAbortRef = useRef<AbortController | null>(null)
  const agentManagerTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Per-tab ACK state to prevent cross-tab cursor corruption when multiple streams are active
  type AckState = {
    lastSeenSeq: number
    lastAckedSeq: number
    ackTimeout: NodeJS.Timeout | null
    ackInFlight: boolean
  }
  const ackStateByTabRef = useRef<Map<string, AckState>>(new Map())
  const getAckState = (tabIdKey: string): AckState => {
    let state = ackStateByTabRef.current.get(tabIdKey)
    if (!state) {
      state = { lastSeenSeq: 0, lastAckedSeq: 0, ackTimeout: null, ackInFlight: false }
      ackStateByTabRef.current.set(tabIdKey, state)
    }
    return state
  }

  // Get active tab for message routing
  const activeTab = useActiveTab(workspace)

  // Store hooks
  const streamingActions = useStreamingActions()
  const userApiKey = useApiKey()
  const userModel = useModel()
  const planMode = usePlanMode()
  const { addEvent: addDevEvent } = useDevTerminal()

  // Agent supervisor state
  const agentSupervisorEnabled = useFeatureFlag("AGENT_SUPERVISOR")
  const prGoal = useGoal()
  const building = useBuilding()
  const targetUsers = useTargetUsers()

  // Local state for agent supervisor
  const isEvaluatingProgressRef = useRef(false)

  const createRequestBody = useCallback(
    (message: string, analyzeImageUrls?: string[]) => {
      // Tab.id IS the conversation key - no separate sessionId
      const activeTabId = activeTab?.id
      if (!activeTabId || !tabGroupId) {
        throw new Error("[useChatMessaging] Cannot create request: activeTab or tabGroupId is missing")
      }

      // Check if we need to resume at a specific message (user deleted messages)
      const dexieState = useDexieMessageStore.getState()
      const resumeSessionAt = dexieState.resumeSessionAtByTab[activeTabId] || undefined

      const baseBody = {
        message,
        tabId: activeTabId,
        tabGroupId,
        apiKey: userApiKey || undefined,
        model: userModel,
        analyzeImageUrls: analyzeImageUrls?.length ? analyzeImageUrls : undefined,
        // Read plan mode directly from store to avoid stale closure
        planMode: getPlanModeState().planMode || undefined, // Only send if true
        // Resume at specific message if user deleted messages
        resumeSessionAt,
      }
      return isTerminal ? { ...baseBody, workspace: workspace || undefined } : baseBody
    },
    [tabId, activeTab?.id, tabGroupId, userApiKey, userModel, planMode, isTerminal, workspace],
  )

  const buildPromptForClaude = useCallback((userMessage: UIMessage): PromptBuildResult => {
    return buildPromptWithAttachmentsEx(userMessage.content as string, userMessage.attachments || [])
  }, [])

  /**
   * Handle completion features like agent supervisor.
   * IMPORTANT: targetTabId must be passed to ensure messages go to the correct tab.
   * Using global state would cause cross-tab message leakage when user switches tabs
   * during an active stream.
   *
   * @param targetTabId - The tab ID that initiated the stream. Tab.id IS the conversation
   *   key in our architecture. This parameter was captured at stream start, ensuring we
   *   query/update the correct conversation even if the user switches tabs during streaming.
   */
  const handleCompletionFeatures = useCallback(
    async (targetTabId: string) => {
      const state = useDexieMessageStore.getState()
      // CRITICAL: Use targetTabId (the tab ID passed from the caller), NOT state.currentTabId
      // state.currentTabId reflects whichever tab is currently active in the UI, which may have
      // changed if the user switched tabs during streaming. targetTabId was captured
      // at stream start and represents the correct conversation to query/update.
      let formattedMessages = ""
      if (state.session?.userId && targetTabId) {
        try {
          const db = getMessageDb(state.session.userId)
          const dbMessages = await db.messages.where("tabId").equals(targetTabId).sortBy("seq")
          const uiMessages = dbMessages.map(toUIMessage)
          formattedMessages = formatMessagesAsText(uiMessages)
        } catch (e) {
          console.warn("[AgentSupervisor] Failed to read messages from Dexie:", e)
        }
      }

      if (agentSupervisorEnabled && prGoal && workspace && formattedMessages) {
        isEvaluatingProgressRef.current = true
        const agentAbort = new AbortController()
        agentManagerAbortRef.current = agentAbort

        fetch("/api/evaluate-progress", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: agentAbort.signal,
          body: JSON.stringify({
            conversation: formattedMessages,
            prGoal,
            workspace,
            building,
            targetUsers,
            model: userModel,
          }),
        })
          .then(res => res.json())
          .then(data => {
            if (data.ok && data.nextAction) {
              const action = data.nextAction.toUpperCase()

              const isDone = /^DONE\b|:\s*DONE\b|is:\s*DONE\b/i.test(action)
              if (isDone) {
                const doneMatch = data.nextAction.match(/DONE[\s\-:]*(.*)$/is)
                const message = doneMatch?.[1]?.trim() || "PR goal complete!"
                const doneMessage: UIMessage = {
                  id: `agent-manager-done-${Date.now()}`,
                  type: "agent_manager",
                  content: { status: "done", message } satisfies AgentManagerContent,
                  timestamp: new Date(),
                }
                // CRITICAL: Pass targetTabId to prevent cross-tab leakage
                addMessage(doneMessage, targetTabId)
                return
              }

              const isStop = /^STOP\b|:\s*STOP\b|is:\s*STOP\b/i.test(action)
              if (isStop) {
                const stopMatch = data.nextAction.match(/STOP[\s\-:]*(.*)$/is)
                const message = stopMatch?.[1]?.trim() || "Agent needs input"
                const stopMessage: UIMessage = {
                  id: `agent-manager-stop-${Date.now()}`,
                  type: "agent_manager",
                  content: { status: "stop", message } satisfies AgentManagerContent,
                  timestamp: new Date(),
                }
                // CRITICAL: Pass targetTabId to prevent cross-tab leakage
                addMessage(stopMessage, targetTabId)
                setMsg("")
                return
              }

              const agentMessage = `agentmanager> ${data.nextAction}`
              setMsg(agentMessage)
              agentManagerTimeoutRef.current = setTimeout(() => {
                agentManagerTimeoutRef.current = null
                // Note: sendMessage will be called via the returned function
              }, 4000)
              if (!data.onTrack) {
                toast("Supervisor: Course correction suggested", { icon: "🎯" })
              }
            }
          })
          .catch(err => {
            if (err instanceof Error && err.name !== "AbortError") {
              console.error("[AgentSupervisor] Error:", err)
            }
          })
          .finally(() => {
            isEvaluatingProgressRef.current = false
            agentManagerAbortRef.current = null
          })
      }
    },
    [agentSupervisorEnabled, prGoal, workspace, building, targetUsers, userModel, addMessage, setMsg],
  )

  const ACK_DEBOUNCE_MS = 1000
  const ACK_BATCH_SIZE = 20

  const flushAck = useCallback(
    async (targetTabId: string) => {
      if (!workspace || !tabGroupId) return

      const ackState = getAckState(targetTabId)
      const seq = ackState.lastSeenSeq
      if (!seq || seq <= ackState.lastAckedSeq) return
      if (ackState.ackInFlight) return

      ackState.ackInFlight = true
      try {
        await fetch("/api/claude/stream/reconnect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            tabGroupId,
            tabId: targetTabId,
            workspace,
            ackOnly: true,
            lastSeenSeq: seq,
          }),
        })
        ackState.lastAckedSeq = Math.max(ackState.lastAckedSeq, seq)
      } catch {
        // Best-effort; replay fallback will handle missed acks
      } finally {
        ackState.ackInFlight = false
        if (ackState.lastSeenSeq > ackState.lastAckedSeq) {
          // Schedule another ack if we advanced during the request
          if (!ackState.ackTimeout) {
            ackState.ackTimeout = setTimeout(() => {
              ackState.ackTimeout = null
              void flushAck(targetTabId)
            }, ACK_DEBOUNCE_MS)
          }
        }
      }
    },
    [workspace, tabGroupId],
  )

  const scheduleAck = useCallback(
    (targetTabId: string) => {
      if (!workspace || !tabGroupId) return
      const ackState = getAckState(targetTabId)
      if (ackState.ackTimeout) return
      ackState.ackTimeout = setTimeout(() => {
        ackState.ackTimeout = null
        void flushAck(targetTabId)
      }, ACK_DEBOUNCE_MS)
    },
    [flushAck, workspace, tabGroupId],
  )

  const sendStreaming = useCallback(
    async (userMessage: UIMessage, targetTabId: string) => {
      let receivedAnyMessage = false
      let timeoutId: NodeJS.Timeout | null = null
      let shouldStopReading = false

      // Capture the tabId at stream start for validation — strict, no fallback
      const expectedTabId = activeTab?.id

      // Track seen messageIds for idempotency (prevents duplicate processing)
      const seenMessageIds = new Set<string>()
      // Reset per-tab ACK state for this stream
      const ackState = getAckState(targetTabId)
      ackState.lastSeenSeq = 0
      ackState.lastAckedSeq = 0
      if (ackState.ackTimeout) {
        clearTimeout(ackState.ackTimeout)
        ackState.ackTimeout = null
      }

      try {
        const { prompt, analyzeImageUrls } = buildPromptForClaude(userMessage)
        const requestBody = createRequestBody(prompt, analyzeImageUrls)

        const abortController = new AbortController()
        abortControllerRef.current = abortController
        setAbortController(targetTabId, abortController)

        timeoutId = setTimeout(() => {
          if (!receivedAnyMessage) {
            console.error("[Chat] Request timeout - no response received in 60s")
            streamingActions.recordError(targetTabId, {
              type: "timeout_error",
              message: "Request timeout - no response received in 60s",
            })
            sendClientError({
              tabId: targetTabId,
              errorType: ClientError.TIMEOUT_ERROR,
              data: { message: "Request timeout - no response received in 60s", timeoutSeconds: 60 },
              addDevEvent,
            })
            abortController.abort()
          }
        }, 60000)

        if (isDevelopment()) {
          const requestEvent = {
            type: ClientRequest.MESSAGE,
            requestId: targetTabId,
            timestamp: new Date().toISOString(),
            data: { endpoint: "/api/claude/stream", method: "POST", body: requestBody },
          }
          addDevEvent({
            eventName: ClientRequest.MESSAGE,
            event: requestEvent,
            rawSSE: `${JSON.stringify(requestEvent)}\n`,
          })
        }

        const response = await retryAsync(
          async () => {
            const res = await fetch("/api/claude/stream", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify(requestBody),
              signal: abortController.signal,
            })

            if (!res.ok) {
              const errorData: StructuredError | null = await res.json().catch(() => null)
              let userMessage: string
              if (errorData?.error) {
                userMessage = getErrorMessage(errorData.error, errorData.details) || errorData.message
                const helpText = getErrorHelp(errorData.error, errorData.details)
                if (helpText) userMessage += `\n\n${helpText}`
                if (errorData.error === ErrorCodes.CONVERSATION_BUSY) {
                  toast.error(userMessage, { duration: 4000, position: "top-center" })
                }
              } else {
                userMessage = `HTTP ${res.status}: ${res.statusText}`
              }
              throw new HttpError(userMessage, res.status, res.statusText, errorData?.error)
            }
            return res
          },
          {
            attempts: 3,
            minDelayMs: 1000,
            maxDelayMs: 5000,
            shouldRetry: error => isRetryableNetworkError(error),
          },
        )

        if (!response.body) {
          throw new Error("No response body received from server")
        }

        const headerRequestId = response.headers.get("X-Request-Id")
        if (headerRequestId) {
          currentRequestIdRef.current = headerRequestId
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        const MAX_CONSECUTIVE_PARSE_ERRORS = 10
        let buffer = ""

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done || shouldStopReading) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split("\n")
            buffer = lines.pop() || ""

            for (const line of lines) {
              if (!line.trim()) continue

              try {
                const parsed: unknown = JSON.parse(line)

                if (!isValidStreamEvent(parsed)) {
                  streamingActions.incrementConsecutiveErrors(targetTabId)
                  streamingActions.recordError(targetTabId, {
                    type: "invalid_event_structure",
                    message: "Stream event failed type guard validation",
                  })
                  const consecutiveErrors = streamingActions.getConsecutiveErrors(targetTabId)
                  sendClientError({
                    tabId: targetTabId,
                    errorType: ClientError.INVALID_EVENT_STRUCTURE,
                    data: { message: parsed, consecutiveErrors },
                    addDevEvent,
                  })
                  if (consecutiveErrors >= MAX_CONSECUTIVE_PARSE_ERRORS) {
                    shouldStopReading = true
                    reader.cancel()
                    break
                  }
                  continue
                }

                const eventData = parsed

                if (!currentRequestIdRef.current && eventData.requestId) {
                  currentRequestIdRef.current = eventData.requestId
                }

                // Idempotency check: skip duplicate messages
                const messageId = (eventData as { messageId?: string }).messageId
                if (messageId) {
                  if (seenMessageIds.has(messageId)) {
                    console.log(`[Chat] Duplicate messageId ${messageId}, skipping`)
                    continue
                  }
                  seenMessageIds.add(messageId)
                }

                // Validate tabId matches what we sent
                // If server sends a tabId that doesn't match, this message is for a different tab
                const responseTabId = (eventData as { tabId?: string }).tabId
                if (expectedTabId && responseTabId && responseTabId !== expectedTabId) {
                  console.warn(
                    `[Chat] TabId mismatch: expected ${expectedTabId}, got ${responseTabId}. Skipping message.`,
                  )
                  continue
                }

                // Track stream sequence for cursor-based replay (per-tab)
                const streamSeq = (eventData as { streamSeq?: number }).streamSeq
                if (typeof streamSeq === "number") {
                  const ackStateForSeq = getAckState(targetTabId)
                  if (streamSeq > ackStateForSeq.lastSeenSeq) {
                    ackStateForSeq.lastSeenSeq = streamSeq
                  }
                  streamingActions.recordStreamSeq(targetTabId, streamSeq)
                  if (streamSeq - ackStateForSeq.lastAckedSeq >= ACK_BATCH_SIZE) {
                    void flushAck(targetTabId)
                  } else {
                    scheduleAck(targetTabId)
                  }
                }

                if (isWarningMessage(eventData)) {
                  const warning = eventData.data.content as BridgeWarningContent
                  console.log("[Chat] OAuth warning received:", warning.provider, warning.message)
                  continue
                }

                if (isDevelopment()) {
                  addDevEvent({ eventName: eventData.type, event: eventData, rawSSE: line })
                }

                receivedAnyMessage = true
                streamingActions.recordMessageReceived(targetTabId)
                streamingActions.resetConsecutiveErrors(targetTabId)

                const message = parseStreamEvent(eventData, targetTabId, streamingActions)
                if (message) {
                  await addMessage(message, targetTabId)
                  if (
                    isCompleteEvent(eventData) ||
                    isDoneEvent(eventData) ||
                    isErrorEvent(eventData) ||
                    isInterruptEvent(eventData)
                  ) {
                    receivedAnyMessage = true
                    isSubmittingByTab.current.set(targetTabId, false)
                    void flushAck(targetTabId)
                    if (
                      (isCompleteEvent(eventData) || isDoneEvent(eventData)) &&
                      !isErrorEvent(eventData) &&
                      !isInterruptEvent(eventData)
                    ) {
                      setShowCompletionDots(true)
                      // Clear resumeSessionAt after successful message send
                      useDexieMessageStore.getState().clearResumeSessionAt(targetTabId)
                      // Pass targetTabId to ensure agent supervisor uses correct conversation
                      handleCompletionFeatures(targetTabId)
                    }
                    shouldStopReading = true
                    break
                  }
                }
              } catch (parseError) {
                streamingActions.incrementConsecutiveErrors(targetTabId)
                streamingActions.recordError(targetTabId, {
                  type: "parse_error",
                  message: "Failed to parse NDJSON line",
                  linePreview: line.slice(0, 200),
                })
                const consecutiveErrors = streamingActions.getConsecutiveErrors(targetTabId)
                sendClientError({
                  tabId: targetTabId,
                  errorType: ClientError.PARSE_ERROR,
                  data: {
                    consecutiveErrors,
                    line: line.slice(0, 200),
                    error: parseError instanceof Error ? parseError.message : String(parseError),
                  },
                  addDevEvent,
                })
                if (consecutiveErrors >= MAX_CONSECUTIVE_PARSE_ERRORS) {
                  sendClientError({
                    tabId: targetTabId,
                    errorType: ClientError.CRITICAL_PARSE_ERROR,
                    data: { consecutiveErrors, message: "Too many consecutive parse errors, stopping stream" },
                    addDevEvent,
                  })
                  await addMessage(
                    {
                      id: Date.now().toString(),
                      type: "sdk_message",
                      content: {
                        type: "result",
                        is_error: true,
                        result:
                          "Connection unstable: Multiple parse errors detected. Please try again or refresh the page.",
                      },
                      timestamp: new Date(),
                    },
                    targetTabId,
                  )
                  shouldStopReading = true
                  reader.cancel()
                  break
                }
              }
            }
          }
        } catch (readerError) {
          if (abortController.signal.aborted) {
            streamingActions.endStream(targetTabId)
            return
          }
          streamingActions.recordError(targetTabId, {
            type: "reader_error",
            message: readerError instanceof Error ? readerError.message : "Unknown reader error",
          })
          sendClientError({
            tabId: targetTabId,
            errorType: ClientError.READER_ERROR,
            data: {
              receivedMessages: receivedAnyMessage,
              error: readerError instanceof Error ? readerError.message : String(readerError),
            },
            addDevEvent,
          })
          if (!receivedAnyMessage) {
            throw new Error("Connection lost before receiving any response")
          }
        }

        if (!receivedAnyMessage && !abortController.signal.aborted) {
          throw new Error("Server closed connection without sending any response")
        }

        streamingActions.endStream(targetTabId)
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") {
          if (error instanceof HttpError) {
            sendClientError({
              tabId: targetTabId,
              errorType: ClientError.HTTP_ERROR,
              data: { status: error.status, statusText: error.statusText, message: error.message },
              addDevEvent,
            })
          } else {
            sendClientError({
              tabId: targetTabId,
              errorType: ClientError.GENERAL_ERROR,
              data: { errorName: error.name, message: error.message, stack: error.stack },
              addDevEvent,
            })
          }
        }

        if (error instanceof Error && error.name !== "AbortError") {
          const isAuthError =
            error instanceof HttpError &&
            (error.status === 401 ||
              error.errorCode === ErrorCodes.NO_SESSION ||
              error.errorCode === ErrorCodes.AUTH_REQUIRED)

          if (isAuthError) {
            streamingActions.endStream(targetTabId)
            authStore.handleSessionExpired("Your session has expired. Please log in again to continue.")
            return
          }

          // Check if this is an OAuth/API auth error from the SDK stream
          // These errors are already displayed via OAuthErrorMessage in AssistantMessage
          // Don't duplicate with ErrorResultMessage
          const isOAuthApiError =
            error.message.includes("authentication_error") &&
            (error.message.includes("OAuth token has expired") || error.message.includes("Please run /login"))

          const isConversationBusy = error instanceof HttpError && error.errorCode === ErrorCodes.CONVERSATION_BUSY
          if (!isConversationBusy && !isOAuthApiError) {
            const errorMessage: UIMessage = {
              id: Date.now().toString(),
              type: "sdk_message",
              content: { type: "result", is_error: true, result: error.message },
              timestamp: new Date(),
            }
            await addMessage(errorMessage, targetTabId)
          }
        }

        streamingActions.endStream(targetTabId)
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
        void flushAck(targetTabId)
        const ackStateCleanup = getAckState(targetTabId)
        if (ackStateCleanup.ackTimeout) {
          clearTimeout(ackStateCleanup.ackTimeout)
          ackStateCleanup.ackTimeout = null
        }
        abortControllerRef.current = null
        clearAbortController(targetTabId)
        currentRequestIdRef.current = null
      }
    },
    [
      createRequestBody,
      buildPromptForClaude,
      streamingActions,
      addDevEvent,
      addMessage,
      setShowCompletionDots,
      handleCompletionFeatures,
      flushAck,
      scheduleAck,
    ],
  )

  const sendMessage = useCallback(
    async (overrideMessage?: string) => {
      const messageToSend = overrideMessage ?? msg
      // Use activeTab.id for per-tab submission check
      const targetTabId = activeTab?.id
      const isTabSubmitting = targetTabId ? (isSubmittingByTab.current.get(targetTabId) ?? false) : false

      // Note: isStopping check is done by the caller in ChatInput
      // Check per-tab submission state, not global
      if (isTabSubmitting || busy || !messageToSend.trim()) return
      // Strict: require activeTab — tab.id IS the conversation key
      if (!tabId || !targetTabId) return

      // Mark this specific tab as submitting
      isSubmittingByTab.current.set(targetTabId, true)
      streamingActions.startStream(targetTabId)

      const attachments = chatInputRef.current?.getAttachments() || []

      const userMessage: UIMessage = {
        id: Date.now().toString(),
        type: "user",
        content: messageToSend,
        timestamp: new Date(),
        attachments: attachments.length > 0 ? attachments : undefined,
      }
      await addMessage(userMessage, targetTabId)
      setMsg("")
      chatInputRef.current?.clearAllAttachments()
      forceScrollToBottom()

      try {
        await sendStreaming(userMessage, targetTabId)
      } finally {
        // Clear submission state for this specific tab
        isSubmittingByTab.current.set(targetTabId, false)
      }
    },
    [
      msg,
      busy,
      tabId,
      activeTab?.id,
      streamingActions,
      chatInputRef,
      addMessage,
      setMsg,
      forceScrollToBottom,
      sendStreaming,
    ],
  )

  return {
    sendMessage,
    isEvaluatingProgress: isEvaluatingProgressRef.current,
    agentManagerAbortRef,
    agentManagerTimeoutRef,
    // Refs needed by useStreamCancellation
    abortControllerRef,
    currentRequestIdRef,
    isSubmittingByTabRef: isSubmittingByTab,
  }
}
