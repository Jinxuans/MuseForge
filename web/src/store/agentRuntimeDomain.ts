export const AGENT_STOPPED_MESSAGE = '已停止生成。'

export function getAgentRoundControllerKey(conversationId: string, roundId: string) {
  return `${conversationId}:${roundId}`
}

export function createAgentAbortError() {
  return new DOMException('Agent 请求已停止', 'AbortError')
}

export function appendAgentStoppedMessage(content: string) {
  const trimmed = content.trimEnd()
  if (!trimmed) return AGENT_STOPPED_MESSAGE
  if (trimmed.endsWith(AGENT_STOPPED_MESSAGE)) return trimmed
  return `${trimmed}\n\n${AGENT_STOPPED_MESSAGE}`
}

export function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)))
}
