import type {
  CompleteEventData,
  DoneEventData,
  ErrorEventData,
  InterruptEventData,
  MessageEventData,
  PingEventData,
  StartEventData,
  StreamEvent,
} from "@/features/chat/lib/message-parser"
import { BridgeStreamType } from "@/features/chat/lib/streaming/ndjson"

export function isStartEvent(event: StreamEvent): event is StreamEvent & { data: StartEventData } {
  return event.type === BridgeStreamType.START && "cwd" in event.data
}

export function isMessageEvent(event: StreamEvent): event is StreamEvent & { data: MessageEventData } {
  return event.type === BridgeStreamType.MESSAGE && "messageType" in event.data && "content" in event.data
}

export function isCompleteEvent(event: StreamEvent): event is StreamEvent & { data: CompleteEventData } {
  return event.type === BridgeStreamType.COMPLETE && "totalMessages" in event.data
}

export function isErrorEvent(event: StreamEvent): event is StreamEvent & { data: ErrorEventData } {
  return event.type === BridgeStreamType.ERROR && "error" in event.data && "message" in event.data
}

export function isPingEvent(event: StreamEvent): event is StreamEvent & { data: PingEventData } {
  return event.type === BridgeStreamType.PING
}

export function isDoneEvent(event: StreamEvent): event is StreamEvent & { data: DoneEventData } {
  return event.type === BridgeStreamType.DONE
}

export function isInterruptEvent(event: StreamEvent): event is StreamEvent & { data: InterruptEventData } {
  return event.type === BridgeStreamType.INTERRUPT && "message" in event.data && "source" in event.data
}
