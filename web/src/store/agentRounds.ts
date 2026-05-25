import type { AgentConversation, AgentMessage, AgentRound, ResponsesOutputItem } from '../types'
import { AGENT_STOPPED_MESSAGE, appendAgentStoppedMessage } from './agentRuntimeDomain'
import { genId } from './shared'

const AGENT_ROUND_IMAGE_MENTION_RE = /@(?:第)?(\d+)轮图(\d+)/g

function getAgentRoundChildren(conversation: AgentConversation, parentRoundId: string | null) {
  return conversation.rounds.filter((round) => (round.parentRoundId ?? null) === parentRoundId)
}

function getLatestAgentLeafId(conversation: AgentConversation, startRoundId: string | null = null): string | null {
  let currentId = startRoundId
  if (!currentId) {
    const roots = getAgentRoundChildren(conversation, null)
    currentId = roots[roots.length - 1]?.id ?? null
  }

  while (currentId) {
    const children = getAgentRoundChildren(conversation, currentId)
    const nextId = children[children.length - 1]?.id ?? null
    if (!nextId) return currentId
    currentId = nextId
  }

  return null
}

export function getAgentRoundPath(conversation: AgentConversation, roundId: string | null): AgentRound[] {
  if (!roundId) return []
  const byId = new Map(conversation.rounds.map((round) => [round.id, round]))
  const path: AgentRound[] = []
  const seen = new Set<string>()
  let current = byId.get(roundId) ?? null

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.unshift(current)
    current = current.parentRoundId ? byId.get(current.parentRoundId) ?? null : null
  }

  return path
}

export function getActiveAgentRounds(conversation: AgentConversation): AgentRound[] {
  const activeRoundId = conversation.activeRoundId && conversation.rounds.some((round) => round.id === conversation.activeRoundId)
    ? conversation.activeRoundId
    : getLatestAgentLeafId(conversation)
  return getAgentRoundPath(conversation, activeRoundId ?? null)
}

export function reindexAgentRounds(conversation: AgentConversation): AgentConversation {
  const indexById = new Map<string, number>()
  const visit = (parentRoundId: string | null, depth: number) => {
    for (const child of getAgentRoundChildren(conversation, parentRoundId)) {
      indexById.set(child.id, depth)
      visit(child.id, depth + 1)
    }
  }
  visit(null, 1)
  return {
    ...conversation,
    rounds: conversation.rounds.map((round) => ({
      ...round,
      index: indexById.get(round.id) ?? round.index,
    })),
  }
}

export function remapAgentRoundMentionsForPathChange(content: string, oldPath: AgentRound[], newPath: AgentRound[]) {
  if (!content || oldPath.length === 0) return content
  const newIndexByRoundId = new Map(newPath.map((round, index) => [round.id, index + 1]))
  return content.replace(AGENT_ROUND_IMAGE_MENTION_RE, (match, roundNumber: string, imageNumber: string) => {
    const oldRound = oldPath[Number(roundNumber) - 1]
    if (!oldRound) return match
    const newRoundIndex = newIndexByRoundId.get(oldRound.id)
    if (!newRoundIndex) return `@已删除轮次图${imageNumber}`
    return `@第${newRoundIndex}轮图${imageNumber}`
  })
}

export function deleteAgentRoundFromConversation(conversation: AgentConversation, roundId: string, now = Date.now()): AgentConversation {
  const targetRound = conversation.rounds.find((round) => round.id === roundId)
  if (!targetRound) return conversation

  const oldPathByRoundId = new Map(conversation.rounds.map((round) => [round.id, getAgentRoundPath(conversation, round.id)]))
  const rounds = conversation.rounds
    .filter((candidate) => candidate.id !== roundId)
    .map((candidate) =>
      candidate.parentRoundId === roundId
        ? { ...candidate, parentRoundId: targetRound.parentRoundId ?? null }
        : candidate,
    )
  const messages = conversation.messages.filter((candidate) => candidate.roundId !== roundId)
  const nextConversation = reindexAgentRounds({
    ...conversation,
    rounds,
    messages,
    activeRoundId: conversation.activeRoundId === roundId ? null : conversation.activeRoundId ?? null,
  })
  const newPathByRoundId = new Map(nextConversation.rounds.map((round) => [round.id, getAgentRoundPath(nextConversation, round.id)]))
  const remappedMessages = nextConversation.messages.map((message) => {
    if (!message.roundId) return message
    const oldPath = oldPathByRoundId.get(message.roundId) ?? []
    const newPath = newPathByRoundId.get(message.roundId) ?? []
    const content = remapAgentRoundMentionsForPathChange(message.content, oldPath, newPath)
    return content === message.content ? message : { ...message, content }
  })
  const withRemappedMessages = { ...nextConversation, messages: remappedMessages }
  const activeRounds = getActiveAgentRounds(withRemappedMessages)
  return {
    ...withRemappedMessages,
    activeRoundId: withRemappedMessages.activeRoundId ?? activeRounds[activeRounds.length - 1]?.id ?? null,
    updatedAt: now,
  }
}

export function updateAgentConversationTitleIfUnchanged(
  conversation: AgentConversation,
  prompt: string,
  fallbackTitle: string,
  title: string,
  now = Date.now(),
): AgentConversation {
  const firstRound = conversation.rounds[0]
  if (!firstRound || firstRound.prompt !== prompt || conversation.title !== fallbackTitle) return conversation
  return { ...conversation, title, updatedAt: now }
}

export function stopAgentRoundInConversation(conversation: AgentConversation, roundId: string, now = Date.now()): { conversation: AgentConversation; stopped: boolean } {
  const round = conversation.rounds.find((item) => item.id === roundId)
  if (!round || round.status !== 'running') return { conversation, stopped: false }

  const existingAssistantMessage = conversation.messages.find((message) => message.roundId === roundId && message.role === 'assistant')
  const assistantMessageId = existingAssistantMessage?.id ?? genId()
  return {
    stopped: true,
    conversation: {
      ...conversation,
      updatedAt: now,
      rounds: conversation.rounds.map((item) =>
        item.id === roundId
          ? {
              ...item,
              ...(assistantMessageId ? { assistantMessageId } : {}),
              status: 'error',
              error: AGENT_STOPPED_MESSAGE,
              finishedAt: now,
            }
          : item,
      ),
      messages: existingAssistantMessage
        ? conversation.messages.map((message) =>
            message.id === existingAssistantMessage.id
              ? { ...message, content: appendAgentStoppedMessage(message.content) }
              : message,
          )
        : [
            ...conversation.messages,
            {
              id: assistantMessageId,
              role: 'assistant',
              content: AGENT_STOPPED_MESSAGE,
              roundId,
              createdAt: now,
            },
          ],
    },
  }
}

export function appendAgentAssistantMessageDelta(conversation: AgentConversation, messageId: string, delta: string, now = Date.now()) {
  if (!delta) return conversation
  return {
    ...conversation,
    updatedAt: now,
    messages: conversation.messages.map((message) =>
      message.id === messageId
        ? { ...message, content: `${message.content}${delta}` }
        : message,
    ),
  }
}

export function attachTaskToAgentRound(conversation: AgentConversation, roundId: string, assistantMessageId: string, taskId: string, now = Date.now()) {
  return {
    ...conversation,
    updatedAt: now,
    rounds: conversation.rounds.map((item) =>
      item.id === roundId
        ? { ...item, outputTaskIds: item.outputTaskIds.includes(taskId) ? item.outputTaskIds : [...item.outputTaskIds, taskId] }
        : item,
    ),
    messages: conversation.messages.map((message) =>
      message.id === assistantMessageId
        ? { ...message, outputTaskIds: [...new Set([...(message.outputTaskIds ?? []), taskId])] }
        : message,
    ),
  }
}

export function ensureStreamingAssistantMessage(conversation: AgentConversation, roundId: string, assistantMessageId: string, now = Date.now()) {
  return {
    ...conversation,
    updatedAt: now,
    rounds: conversation.rounds.map((item) =>
      item.id === roundId ? { ...item, assistantMessageId } : item,
    ),
    messages: conversation.messages.some((message) => message.id === assistantMessageId)
      ? conversation.messages.map((message) => message.id === assistantMessageId ? { ...message, content: '', outputTaskIds: [] } : message)
      : [
          ...conversation.messages,
          {
            id: assistantMessageId,
            role: 'assistant' as const,
            content: '',
            roundId,
            createdAt: now,
          },
        ],
  }
}

export function setAgentRoundResponseOutput(
  conversation: AgentConversation,
  roundId: string,
  responseOutput: ResponsesOutputItem[],
  responseId?: string,
  now = Date.now(),
) {
  return {
    ...conversation,
    updatedAt: now,
    rounds: conversation.rounds.map((item) =>
      item.id === roundId
        ? {
            ...item,
            ...(responseId !== undefined ? { responseId } : {}),
            responseOutput,
          }
        : item,
    ),
  }
}

export function completeAgentRoundInConversation(
  conversation: AgentConversation,
  roundId: string,
  assistantMessage: AgentMessage,
  taskIds: string[],
  responseOutput: ResponsesOutputItem[],
  responseId?: string,
  now = Date.now(),
) {
  return {
    ...conversation,
    updatedAt: now,
    rounds: conversation.rounds.map((round) =>
      round.id === roundId
        ? {
            ...round,
            assistantMessageId: assistantMessage.id,
            outputTaskIds: taskIds,
            responseId,
            responseOutput,
            status: 'done' as const,
            error: null,
            finishedAt: now,
          }
        : round,
    ),
    messages: conversation.messages.some((message) => message.id === assistantMessage.id)
      ? conversation.messages.map((message) => message.id === assistantMessage.id ? assistantMessage : message)
      : [...conversation.messages, assistantMessage],
  }
}

export function failAgentRoundInConversation(conversation: AgentConversation, roundId: string, message: string, assistantMessageId: string, now = Date.now()) {
  const failedRound = conversation.rounds.find((round) => round.id === roundId)
  const existingAssistantMessage = failedRound?.assistantMessageId
    ? conversation.messages.find((item) => item.id === failedRound.assistantMessageId)
    : conversation.messages.find((item) => item.roundId === roundId && item.role === 'assistant')
  const errorContent = `请求失败：${message}`

  return {
    ...conversation,
    title: conversation.rounds.length === 1 && conversation.rounds[0].id === roundId ? '新对话' : conversation.title,
    updatedAt: now,
    rounds: conversation.rounds.map((round) =>
      round.id === roundId
        ? {
            ...round,
            assistantMessageId: existingAssistantMessage?.id ?? assistantMessageId,
            status: 'error' as const,
            error: message,
            finishedAt: now,
          }
        : round,
    ),
    messages: existingAssistantMessage
      ? conversation.messages.map((item) => item.id === existingAssistantMessage.id ? { ...item, content: errorContent } : item)
      : [
          ...conversation.messages,
          {
            id: assistantMessageId,
            role: 'assistant' as const,
            content: errorContent,
            roundId,
            createdAt: now,
          },
        ],
  }
}

export function submitAgentRoundToConversation(
  conversation: AgentConversation,
  round: AgentRound,
  userMessage: AgentMessage,
  options: {
    nextTitle: string
    shouldAppendToEditingRound: boolean
    editingRoundHasErrorAssistantMessage: boolean
    editingAssistantMessageId?: string | null
    now?: number
  },
): { conversation: AgentConversation; fallbackTitle: string | null } {
  const now = options.now ?? Date.now()
  const fallbackTitle = conversation.rounds.length === 0 ? options.nextTitle : null
  const messages = options.shouldAppendToEditingRound
    ? conversation.messages.some((message) => message.id === userMessage.id)
      ? conversation.messages.map((message) => {
          if (message.id === userMessage.id) return userMessage
          if (options.editingRoundHasErrorAssistantMessage && message.id === options.editingAssistantMessageId) {
            return { ...message, content: '', outputTaskIds: [] }
          }
          return message
        })
      : [...conversation.messages, userMessage]
    : [...conversation.messages, userMessage]

  return {
    fallbackTitle,
    conversation: {
      ...conversation,
      title: options.nextTitle,
      activeRoundId: round.id,
      updatedAt: now,
      rounds: options.shouldAppendToEditingRound
        ? conversation.rounds.map((item) => item.id === round.id ? round : item)
        : [...conversation.rounds, round],
      messages,
    },
  }
}

export function restartErroredAgentRound(conversation: AgentConversation, roundId: string, assistantMessageId?: string | null, now = Date.now()) {
  return {
    ...conversation,
    activeRoundId: roundId,
    updatedAt: now,
    rounds: conversation.rounds.map((round) =>
      round.id === roundId
        ? {
            ...round,
            outputTaskIds: [],
            responseId: undefined,
            responseOutput: undefined,
            status: 'running' as const,
            error: null,
            finishedAt: null,
          }
        : round,
    ),
    messages: assistantMessageId
      ? conversation.messages.map((message) =>
          message.id === assistantMessageId ? { ...message, content: '', outputTaskIds: [] } : message,
        )
      : conversation.messages,
  }
}

export function appendRegeneratedAgentRound(conversation: AgentConversation, round: AgentRound, userMessage: AgentMessage, now = Date.now()) {
  return {
    ...conversation,
    activeRoundId: round.id,
    updatedAt: now,
    rounds: [...conversation.rounds, round],
    messages: [...conversation.messages, userMessage],
  }
}

export function getAgentSiblingRounds(conversation: AgentConversation, round: AgentRound) {
  return getAgentRoundChildren(conversation, round.parentRoundId ?? null)
}

export function getAgentBranchLeafId(conversation: AgentConversation, roundId: string) {
  return getLatestAgentLeafId(conversation, roundId) ?? roundId
}
