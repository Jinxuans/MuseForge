import type { AgentConversation, AgentMessage, AgentRound, ApiProfile, AppSettings, TaskParams } from '../../types'
import { DEFAULT_PARAMS } from '../../types'
import { getActiveApiProfile, normalizeSettings, validateApiProfile } from '../../lib/apiProfiles'
import { normalizeParamsForSettings } from '../../lib/paramCompatibility'
import { persistTaskInputImages } from '../../services/taskSubmissionPreparation'
import type { AppState } from '../appState'
import { appendRegeneratedAgentRound, getActiveAgentRounds, getAgentRoundPath, restartErroredAgentRound, submitAgentRoundToConversation } from './agentRounds'
import { createAgentConversationTitle } from './agentConversationDomain'
import { createSettingsForApiProfile } from '../tasks/taskDomain'
import { genId } from '../shared'
import { uniqueIds } from './agentRuntimeDomain'

type AgentMessageActionState = Pick<
  AppState,
  | 'settings'
  | 'prompt'
  | 'inputImages'
  | 'maskDraft'
  | 'params'
  | 'showToast'
  | 'setAppMode'
  | 'setShowSettings'
  | 'clearMaskDraft'
  | 'agentEditingRoundId'
  | 'setPrompt'
  | 'clearInputImages'
  | 'setAgentEditingRoundId'
  | 'agentConversations'
>

type AgentMessageActionsDeps = {
  executeAgentRound: (
    conversationId: string,
    roundId: string,
    params: TaskParams,
    requestSettings: AppSettings,
    activeProfile: ApiProfile,
  ) => void
  generateAgentConversationTitle: (
    conversationId: string,
    prompt: string,
    inputImageIds: string[],
    requestSettings: AppSettings,
    activeProfile: ApiProfile,
    fallbackTitle: string,
  ) => void
  getActiveAgentConversation: () => AgentConversation
  getState: () => AgentMessageActionState
  updateAgentConversation: (conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) => void
}

export function createAgentMessageActions({
  executeAgentRound,
  generateAgentConversationTitle,
  getActiveAgentConversation,
  getState,
  updateAgentConversation,
}: AgentMessageActionsDeps) {
  async function submitAgentMessage() {
    const state = getState()
    const { settings, prompt, inputImages, maskDraft, params, showToast } = state
    const normalizedSettings = normalizeSettings(settings)
    const activeProfile = getActiveApiProfile(normalizedSettings)

    if (activeProfile.provider !== 'openai' || activeProfile.apiMode !== 'responses') {
      state.setAppMode('agent')
      return
    }

    const validationError = validateApiProfile(activeProfile)
    if (validationError) {
      showToast(`请先完善请求 API 配置：${validationError}`, 'error')
      state.setShowSettings(true)
      return
    }

    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) {
      showToast('请输入消息', 'error')
      return
    }

    const conversation = getActiveAgentConversation()
    if (conversation.rounds.some((round) => round.status === 'running')) {
      showToast('请等待生成完成，或先停止生成', 'info')
      return
    }

    const persistedInputs = await persistTaskInputImages(inputImages, maskDraft, { allowFullMask: true })
    if (persistedInputs.status === 'error') {
      if (persistedInputs.clearMaskDraft) state.clearMaskDraft()
      showToast(persistedInputs.message, 'error')
      return
    }
    if (persistedInputs.status === 'full-mask') return

    const { orderedInputImages, maskImageId, maskTargetImageId } = persistedInputs
    const inputImageIds = uniqueIds(orderedInputImages.map((image) => image.id))

    const requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
    const now = Date.now()
    const editingRound = state.agentEditingRoundId
      ? conversation.rounds.find((item) => item.id === state.agentEditingRoundId) ?? null
      : null
    const editingRoundAssistantMessage = editingRound?.assistantMessageId
      ? conversation.messages.find((message) => message.id === editingRound.assistantMessageId) ?? null
      : conversation.messages.find((message) => message.roundId === editingRound?.id && message.role === 'assistant') ?? null
    const editingRoundHasAssistantMessage = Boolean(editingRoundAssistantMessage)
    const editingRoundHasErrorAssistantMessage = Boolean(
      editingRound?.status === 'error' && editingRoundAssistantMessage?.content.startsWith('请求失败：'),
    )
    const editingRoundHasChildren = editingRound
      ? conversation.rounds.some((round) => (round.parentRoundId ?? null) === editingRound.id)
      : false
    const shouldAppendToEditingRound = Boolean(
      editingRound && !editingRoundHasChildren && (!editingRoundHasAssistantMessage || editingRoundHasErrorAssistantMessage),
    )
    const roundId = shouldAppendToEditingRound && editingRound ? editingRound.id : genId()
    const userMessageId = shouldAppendToEditingRound && editingRound ? editingRound.userMessageId : genId()
    const activeRounds = getActiveAgentRounds(conversation)
    const activeLeafId = activeRounds[activeRounds.length - 1]?.id ?? null
    const parentRoundId = editingRound ? editingRound.parentRoundId ?? null : activeLeafId
    const parentPath = parentRoundId ? getAgentRoundPath(conversation, parentRoundId) : []
    const normalizedParams = {
      ...normalizeParamsForSettings(params, requestSettings, { hasInputImages: inputImageIds.length > 0 }),
      n: DEFAULT_PARAMS.n,
    }
    const round: AgentRound = {
      id: roundId,
      index: shouldAppendToEditingRound && editingRound ? editingRound.index : parentPath.length + 1,
      parentRoundId,
      ...(editingRoundHasErrorAssistantMessage && editingRoundAssistantMessage ? { assistantMessageId: editingRoundAssistantMessage.id } : {}),
      userMessageId,
      prompt: trimmedPrompt,
      inputImageIds,
      maskTargetImageId,
      maskImageId,
      outputTaskIds: [],
      status: 'running',
      error: null,
      createdAt: now,
      finishedAt: null,
    }
    const userMessage: AgentMessage = {
      id: userMessageId,
      role: 'user',
      content: trimmedPrompt,
      roundId,
      inputImageIds,
      maskTargetImageId,
      maskImageId,
      createdAt: now,
    }

    let fallbackTitle: string | null = null
    updateAgentConversation(conversation.id, (current) => {
      const nextTitle = current.rounds.length === 0 ? createAgentConversationTitle(trimmedPrompt, current.title) : current.title
      const result = submitAgentRoundToConversation(current, round, userMessage, {
        nextTitle,
        shouldAppendToEditingRound,
        editingRoundHasErrorAssistantMessage,
        editingAssistantMessageId: editingRoundAssistantMessage?.id,
        now,
      })
      fallbackTitle = result.fallbackTitle
      return result.conversation
    })

    state.setPrompt('')
    state.clearInputImages()
    state.clearMaskDraft()
    state.setAgentEditingRoundId(null)

    if (fallbackTitle) {
      generateAgentConversationTitle(conversation.id, trimmedPrompt, inputImageIds, requestSettings, activeProfile, fallbackTitle)
    }

    executeAgentRound(conversation.id, roundId, normalizedParams, requestSettings, activeProfile)
  }

  async function regenerateAgentAssistantMessage(conversationId: string, roundId: string) {
    const state = getState()
    const { settings, params, showToast } = state
    const normalizedSettings = normalizeSettings(settings)
    const activeProfile = getActiveApiProfile(normalizedSettings)

    if (activeProfile.provider !== 'openai' || activeProfile.apiMode !== 'responses') {
      state.setAppMode('agent')
      return
    }

    const validationError = validateApiProfile(activeProfile)
    if (validationError) {
      showToast(`请先完善请求 API 配置：${validationError}`, 'error')
      state.setShowSettings(true)
      return
    }

    const conversation = state.agentConversations.find((item) => item.id === conversationId)
    const sourceRound = conversation?.rounds.find((item) => item.id === roundId) ?? null
    const sourceUserMessage = sourceRound
      ? conversation?.messages.find((message) => message.id === sourceRound.userMessageId) ?? null
      : null
    if (!conversation || !sourceRound || !sourceUserMessage) {
      showToast('找不到要重新生成的 Agent 消息', 'error')
      return
    }

    if (conversation.rounds.some((round) => round.status === 'running')) {
      showToast('请等待生成完成，或先停止生成', 'info')
      return
    }

    const inputImageIds = uniqueIds(sourceRound.inputImageIds)
    const requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
    const normalizedParams = {
      ...normalizeParamsForSettings(params, requestSettings, { hasInputImages: inputImageIds.length > 0 }),
      n: DEFAULT_PARAMS.n,
    }
    const now = Date.now()
    if (sourceRound.status === 'error') {
      const assistantMessageId = sourceRound.assistantMessageId
        ?? conversation.messages.find((message) => message.roundId === sourceRound.id && message.role === 'assistant')?.id
      updateAgentConversation(conversationId, (current) => restartErroredAgentRound(current, sourceRound.id, assistantMessageId, now))
      state.setAgentEditingRoundId(null)
      executeAgentRound(conversationId, sourceRound.id, normalizedParams, requestSettings, activeProfile)
      return
    }

    const newRoundId = genId()
    const newUserMessageId = genId()
    const newRound: AgentRound = {
      id: newRoundId,
      index: sourceRound.index,
      parentRoundId: sourceRound.parentRoundId ?? null,
      userMessageId: newUserMessageId,
      prompt: sourceRound.prompt || sourceUserMessage.content.trim(),
      inputImageIds,
      maskTargetImageId: sourceRound.maskTargetImageId ?? sourceUserMessage.maskTargetImageId ?? null,
      maskImageId: sourceRound.maskImageId ?? sourceUserMessage.maskImageId ?? null,
      outputTaskIds: [],
      status: 'running',
      error: null,
      createdAt: now,
      finishedAt: null,
    }
    const newUserMessage: AgentMessage = {
      id: newUserMessageId,
      role: 'user',
      content: sourceUserMessage.content,
      roundId: newRoundId,
      inputImageIds,
      maskTargetImageId: sourceRound.maskTargetImageId ?? sourceUserMessage.maskTargetImageId ?? null,
      maskImageId: sourceRound.maskImageId ?? sourceUserMessage.maskImageId ?? null,
      createdAt: now,
    }

    updateAgentConversation(conversationId, (current) => appendRegeneratedAgentRound(current, newRound, newUserMessage, now))
    state.setAgentEditingRoundId(null)
    executeAgentRound(conversationId, newRoundId, normalizedParams, requestSettings, activeProfile)
  }

  return {
    regenerateAgentAssistantMessage,
    submitAgentMessage,
  }
}
