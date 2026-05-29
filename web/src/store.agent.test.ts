import { describe, expect, it } from 'vitest'
import type { AgentConversation } from './types'
import type { AppState } from './store/appState'
import { getSelectedImageMentionLabel } from './lib/promptImageMentions'
import { createAgentModeState, createNonAgentModeState } from './store/app/appModeDomain'
import { createActiveAgentConversationState, createAgentConversationState } from './store/agent/agentConversationActionsDomain'
import {
  deleteAgentRoundFromConversation,
  getActiveAgentRounds,
  remapAgentRoundMentionsForPathChange,
} from './store/agent/agentRounds'
import { cleanStaleAgentInputDrafts } from './store/agent/agentInputDrafts'

function agentConversation(overrides: Partial<AgentConversation> = {}): AgentConversation {
  return {
    id: 'conversation-a',
    title: '新对话',
    activeRoundId: null,
    createdAt: 1,
    updatedAt: 1,
    rounds: [],
    messages: [],
    ...overrides,
  }
}

function agentState(overrides: Partial<AppState> = {}): AppState {
  return {
    appMode: 'gallery',
    agentConversations: [],
    activeAgentConversationId: null,
    agentInputDrafts: {},
    agentSidebarCollapsed: false,
    agentEditingRoundId: null,
    prompt: '',
    inputImages: [],
    maskDraft: null,
    maskEditorImageId: null,
    ...overrides,
  } as AppState
}

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }
const imageB = { id: 'image-b', dataUrl: 'data:image/png;base64,b' }
const draftState = {
  prompt: `参考 ${getSelectedImageMentionLabel(0)} 生成`,
  inputImages: [imageA],
  maskDraft: {
    targetImageId: imageA.id,
    maskDataUrl: 'data:image/png;base64,mask',
    updatedAt: 1,
  },
  maskEditorImageId: imageA.id,
  agentEditingRoundId: 'round-a',
}

describe('agent conversation creation', () => {
  it('refreshes the latest empty conversation instead of creating another one', () => {
    const olderEmpty = agentConversation({ id: 'older-empty', createdAt: 1_000, updatedAt: 1_000 })
    const latestEmpty = agentConversation({ id: 'latest-empty', createdAt: 2_000, updatedAt: 2_000 })

    const result = createAgentConversationState(agentState({
      agentConversations: [olderEmpty, latestEmpty],
      activeAgentConversationId: olderEmpty.id,
      agentSidebarCollapsed: false,
      agentEditingRoundId: 'editing-round',
    }), () => 'new-conversation', 3_000)

    expect(result.conversationId).toBe(latestEmpty.id)
    expect(result.patch.activeAgentConversationId).toBe(latestEmpty.id)
    expect(result.patch.agentConversations).toHaveLength(2)
    expect(result.patch.agentConversations.find((item) => item.id === latestEmpty.id)).toMatchObject({
      createdAt: 3_000,
      updatedAt: 3_000,
    })
    expect(result.patch.agentConversations.find((item) => item.id === olderEmpty.id)).toEqual(olderEmpty)
    expect(result.patch.agentSidebarCollapsed).toBe(true)
    expect(result.patch.agentEditingRoundId).toBeNull()
  })

  it('creates a new conversation when the latest conversation has messages', () => {
    const olderEmpty = agentConversation({ id: 'older-empty', createdAt: 1_000, updatedAt: 1_000 })
    const latestUsed = agentConversation({
      id: 'latest-used',
      createdAt: 2_000,
      updatedAt: 2_000,
      rounds: [{
        id: 'round-a',
        index: 1,
        parentRoundId: null,
        userMessageId: 'message-a',
        prompt: 'prompt',
        inputImageIds: [],
        outputTaskIds: [],
        status: 'done',
        error: null,
        createdAt: 2_000,
        finishedAt: 2_000,
      }],
      messages: [{ id: 'message-a', role: 'user', content: 'prompt', roundId: 'round-a', createdAt: 2_000 }],
    })

    const result = createAgentConversationState(agentState({
      agentConversations: [olderEmpty, latestUsed],
      activeAgentConversationId: latestUsed.id,
    }), () => 'new-conversation', 3_000)

    expect(result.conversationId).toBe('new-conversation')
    expect(result.patch.activeAgentConversationId).toBe('new-conversation')
    expect(result.patch.agentConversations).toHaveLength(3)
    expect(result.patch.agentConversations[result.patch.agentConversations.length - 1]).toMatchObject({
      id: 'new-conversation',
      createdAt: 3_000,
      updatedAt: 3_000,
      messages: [],
      rounds: [],
    })
  })
})

describe('agent round deletion', () => {
  it('renumbers later rounds and remaps image mentions after deleting a middle round', () => {
    const conversation = agentConversation({
      activeRoundId: 'round-3',
      rounds: [
        {
          id: 'round-1',
          index: 1,
          parentRoundId: null,
          userMessageId: 'user-1',
          assistantMessageId: 'assistant-1',
          prompt: '第一轮',
          inputImageIds: [],
          outputTaskIds: ['task-1'],
          status: 'done',
          error: null,
          createdAt: 1,
          finishedAt: 2,
        },
        {
          id: 'round-2',
          index: 2,
          parentRoundId: 'round-1',
          userMessageId: 'user-2',
          assistantMessageId: 'assistant-2',
          prompt: '第二轮',
          inputImageIds: [],
          outputTaskIds: ['task-2'],
          status: 'done',
          error: null,
          createdAt: 3,
          finishedAt: 4,
        },
        {
          id: 'round-3',
          index: 3,
          parentRoundId: 'round-2',
          userMessageId: 'user-3',
          assistantMessageId: 'assistant-3',
          prompt: '第三轮',
          inputImageIds: [],
          outputTaskIds: ['task-3'],
          status: 'done',
          error: null,
          createdAt: 5,
          finishedAt: 6,
        },
      ],
      messages: [
        { id: 'user-1', role: 'user', content: '第一轮', roundId: 'round-1', createdAt: 1 },
        { id: 'assistant-1', role: 'assistant', content: '完成', roundId: 'round-1', createdAt: 2 },
        { id: 'user-2', role: 'user', content: '第二轮', roundId: 'round-2', createdAt: 3 },
        { id: 'assistant-2', role: 'assistant', content: '完成', roundId: 'round-2', createdAt: 4 },
        { id: 'user-3', role: 'user', content: '参考 @第1轮图1、@第2轮图1、@第3轮图1', roundId: 'round-3', createdAt: 5 },
        { id: 'assistant-3', role: 'assistant', content: '完成', roundId: 'round-3', createdAt: 6 },
      ],
    })

    const deleted = deleteAgentRoundFromConversation(conversation, 'round-2', 10)

    expect(deleted.rounds.map((round) => ({ id: round.id, index: round.index, parentRoundId: round.parentRoundId }))).toEqual([
      { id: 'round-1', index: 1, parentRoundId: null },
      { id: 'round-3', index: 2, parentRoundId: 'round-1' },
    ])
    expect(deleted.messages.map((message) => message.id)).toEqual(['user-1', 'assistant-1', 'user-3', 'assistant-3'])
    expect(deleted.messages.find((message) => message.id === 'user-3')?.content).toBe('参考 @第1轮图1、@已删除轮次图1、@第2轮图1')
    expect(deleted.activeRoundId).toBe('round-3')
    expect(deleted.updatedAt).toBe(10)
  })

  it('can remap draft mentions using the old and new active paths after deletion', () => {
    const conversation = agentConversation({
      activeRoundId: 'round-3',
      rounds: [
        {
          id: 'round-1',
          index: 1,
          parentRoundId: null,
          userMessageId: 'user-1',
          prompt: '第一轮',
          inputImageIds: [],
          outputTaskIds: ['task-1'],
          status: 'done',
          error: null,
          createdAt: 1,
          finishedAt: 2,
        },
        {
          id: 'round-2',
          index: 2,
          parentRoundId: 'round-1',
          userMessageId: 'user-2',
          prompt: '第二轮',
          inputImageIds: [],
          outputTaskIds: ['task-2'],
          status: 'done',
          error: null,
          createdAt: 3,
          finishedAt: 4,
        },
        {
          id: 'round-3',
          index: 3,
          parentRoundId: 'round-2',
          userMessageId: 'user-3',
          prompt: '第三轮',
          inputImageIds: [],
          outputTaskIds: ['task-3'],
          status: 'done',
          error: null,
          createdAt: 5,
          finishedAt: 6,
        },
      ],
      messages: [],
    })
    const oldPath = getActiveAgentRounds(conversation)
    const deleted = deleteAgentRoundFromConversation(conversation, 'round-2', 10)
    const newPath = getActiveAgentRounds(deleted)

    expect(remapAgentRoundMentionsForPathChange('继续参考 @第1轮图1、@第2轮图1、@第3轮图1', oldPath, newPath))
      .toBe('继续参考 @第1轮图1、@已删除轮次图1、@第2轮图1')
  })
})

describe('agent draft lifecycle', () => {
  function activeAgentDraftState(overrides: Partial<AppState> = {}) {
    return agentState({
      appMode: 'agent',
      agentConversations: [
        agentConversation({ id: 'conversation-a' }),
        agentConversation({ id: 'conversation-b' }),
      ],
      activeAgentConversationId: 'conversation-a',
      galleryInputDraft: null,
      agentInputDrafts: {},
      agentSidebarCollapsed: false,
      agentAssetPanelCollapsed: false,
      ...draftState,
      ...overrides,
    })
  }

  it('clears visible input but keeps the agent draft when returning to gallery mode', () => {
    const patch = createNonAgentModeState(activeAgentDraftState(), 'gallery')

    expect(patch.appMode).toBe('gallery')
    expect(patch.prompt).toBe('')
    expect(patch.inputImages).toEqual([])
    expect(patch.maskDraft).toBeNull()
    expect(patch.maskEditorImageId).toBeNull()
    expect(patch.agentEditingRoundId).toBeNull()
    expect(patch.agentInputDrafts['conversation-a']).toMatchObject({
      prompt: draftState.prompt,
      inputImages: draftState.inputImages,
      maskDraft: draftState.maskDraft,
      maskEditorImageId: imageA.id,
    })
  })

  it('restores the agent draft when switching back from gallery mode', () => {
    const base = activeAgentDraftState()
    const galleryPatch = createNonAgentModeState(base, 'gallery')
    const agentPatch = createAgentModeState({ ...base, ...galleryPatch } as AppState)

    expect(agentPatch.appMode).toBe('agent')
    expect(agentPatch.prompt).toBe(draftState.prompt)
    expect(agentPatch.inputImages).toEqual(draftState.inputImages)
    expect(agentPatch.maskDraft).toEqual(draftState.maskDraft)
    expect(agentPatch.maskEditorImageId).toBe(imageA.id)
  })

  it('keeps the gallery draft when switching into agent mode and back', () => {
    const galleryPrompt = `画廊 ${getSelectedImageMentionLabel(0)} 草稿`
    const base = agentState({
      appMode: 'gallery',
      activeAgentConversationId: 'conversation-a',
      prompt: galleryPrompt,
      inputImages: [imageB],
      maskDraft: null,
      maskEditorImageId: null,
      galleryInputDraft: null,
      agentInputDrafts: {
        'conversation-a': {
          prompt: draftState.prompt,
          inputImages: draftState.inputImages,
          maskDraft: draftState.maskDraft,
          maskEditorImageId: imageA.id,
        },
      },
    })

    const agentPatch = createAgentModeState(base)
    expect(agentPatch.appMode).toBe('agent')
    expect(agentPatch.galleryInputDraft).toMatchObject({ prompt: galleryPrompt, inputImages: [imageB] })
    expect(agentPatch.prompt).toBe(draftState.prompt)

    const galleryPatch = createNonAgentModeState({ ...base, ...agentPatch } as AppState, 'gallery')
    expect(galleryPatch.appMode).toBe('gallery')
    expect(galleryPatch.prompt).toBe(galleryPrompt)
    expect(galleryPatch.inputImages).toEqual([imageB])
  })

  it('clears stale mentions in the visible input when switching conversations', () => {
    const patch = createActiveAgentConversationState(activeAgentDraftState(), 'conversation-b') as Partial<AppState>

    expect(patch.activeAgentConversationId).toBe('conversation-b')
    expect(patch.prompt).toBe('')
    expect(patch.inputImages).toEqual([])
    expect(patch.maskDraft).toBeNull()
    expect(patch.maskEditorImageId).toBeNull()
    expect(patch.agentEditingRoundId).toBeNull()
    expect(patch.agentInputDrafts?.['conversation-a']?.prompt).toBe(draftState.prompt)
  })

  it('restores the previous conversation draft when switching back', () => {
    const base = activeAgentDraftState()
    const conversationBPatch = createActiveAgentConversationState(base, 'conversation-b')
    const conversationAPatch = createActiveAgentConversationState({ ...base, ...conversationBPatch } as AppState, 'conversation-a') as Partial<AppState>

    expect(conversationAPatch.activeAgentConversationId).toBe('conversation-a')
    expect(conversationAPatch.prompt).toBe(draftState.prompt)
    expect(conversationAPatch.inputImages).toEqual(draftState.inputImages)
    expect(conversationAPatch.maskDraft).toEqual(draftState.maskDraft)
    expect(conversationAPatch.maskEditorImageId).toBe(imageA.id)
    expect(conversationAPatch.agentEditingRoundId).toBeNull()
  })

  it('keeps the current draft when selecting the already active conversation', () => {
    const base = activeAgentDraftState()
    const patch = createActiveAgentConversationState(base, 'conversation-a')
    const state = { ...base, ...patch }

    expect(state.prompt).toBe(draftState.prompt)
    expect(state.inputImages).toEqual(draftState.inputImages)
    expect(state.maskDraft).toEqual(draftState.maskDraft)
    expect(state.maskEditorImageId).toBe(imageA.id)
  })

  it('removes stale agent drafts except the last active conversation', () => {
    const now = 10 * 24 * 60 * 60 * 1000
    const staleUpdatedAt = now - 3 * 24 * 60 * 60 * 1000 - 1
    const recentUpdatedAt = now - 3 * 24 * 60 * 60 * 1000
    const activeDraft = { prompt: 'active', inputImages: [], maskDraft: null, maskEditorImageId: null, updatedAt: staleUpdatedAt }
    const staleDraft = { prompt: 'stale', inputImages: [], maskDraft: null, maskEditorImageId: null, updatedAt: staleUpdatedAt }
    const recentDraft = { prompt: 'recent', inputImages: [], maskDraft: null, maskEditorImageId: null, updatedAt: recentUpdatedAt }

    const cleaned = cleanStaleAgentInputDrafts({
      'conversation-a': activeDraft,
      'conversation-b': staleDraft,
      'conversation-c': recentDraft,
    }, 'conversation-a', now)

    expect(cleaned).toEqual({
      'conversation-a': activeDraft,
      'conversation-c': recentDraft,
    })
  })
})
