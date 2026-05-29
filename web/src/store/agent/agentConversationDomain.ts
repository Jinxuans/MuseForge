import type { AgentConversation } from '../../types'

const AGENT_CONVERSATION_TITLE_MAX_LENGTH = 28

export function createEmptyAgentConversation(id: string, now = Date.now()): AgentConversation {
  return {
    id,
    title: '新对话',
    activeRoundId: null,
    createdAt: now,
    updatedAt: now,
    rounds: [],
    messages: [],
  }
}

export function createAgentConversationTitle(prompt: string, fallbackTitle: string) {
  const title = prompt.replace(/\s+/g, ' ').trim()
  if (!title) return fallbackTitle
  const chars = Array.from(title)
  if (chars.length <= AGENT_CONVERSATION_TITLE_MAX_LENGTH) return title
  return `${chars.slice(0, AGENT_CONVERSATION_TITLE_MAX_LENGTH - 3).join('')}...`
}

export function isEmptyAgentConversation(conversation: AgentConversation) {
  return conversation.rounds.length === 0 && conversation.messages.length === 0 && !conversation.activeRoundId
}

export function getLatestAgentConversation(conversations: AgentConversation[]) {
  return conversations.reduce<AgentConversation | null>((latest, conversation) => {
    if (!latest) return conversation
    if (conversation.updatedAt !== latest.updatedAt) return conversation.updatedAt > latest.updatedAt ? conversation : latest
    return conversation.createdAt > latest.createdAt ? conversation : latest
  }, null)
}

export function touchAgentConversation(conversations: AgentConversation[], conversationId: string, now = Date.now()) {
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? { ...conversation, createdAt: now, updatedAt: now }
      : conversation,
  )
}

export function setAgentConversationActiveRound(conversations: AgentConversation[], conversationId: string, roundId: string | null, now = Date.now()) {
  return conversations.map((conversation) =>
    conversation.id === conversationId ? { ...conversation, activeRoundId: roundId, updatedAt: now } : conversation,
  )
}

export function renameAgentConversationInList(conversations: AgentConversation[], conversationId: string, title: string, now = Date.now()) {
  return conversations.map((conversation) =>
    conversation.id === conversationId ? { ...conversation, title, updatedAt: now } : conversation,
  )
}

export function deleteAgentConversationFromList(conversations: AgentConversation[], conversationId: string) {
  return conversations.filter((conversation) => conversation.id !== conversationId)
}
