import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, type AgentConversation } from './types'
import { DEFAULT_SETTINGS } from './lib/apiProfiles'
import { getPersistedState, migratePersistedState } from './store/persistence/persistedState'
import type { AppState } from './store/appState'

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }
const imageB = { id: 'image-b', dataUrl: 'data:image/png;base64,b' }

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

function persistedAppState(overrides: Partial<AppState> = {}): AppState {
  return {
    settings: { ...DEFAULT_SETTINGS },
    params: { ...DEFAULT_PARAMS },
    appMode: 'gallery',
    prompt: '',
    inputImages: [],
    galleryInputDraft: null,
    dismissedCodexCliPrompts: [],
    categories: [],
    activeCategoryId: 'all',
    taskView: 'gallery',
    promptLibrary: [],
    agentConversations: [],
    activeAgentConversationId: null,
    agentInputDrafts: {},
    agentSidebarCollapsed: false,
    agentAssetTab: 'references',
    agentAssetPanelCollapsed: false,
    supportPromptDismissed: false,
    ...overrides,
  } as AppState
}

describe('input persistence setting', () => {
  it('persists input when restart input restore is enabled', () => {
    const persisted = getPersistedState(persistedAppState({
      prompt: 'prompt',
      inputImages: [imageA],
    }), { includeAgentConversations: false })

    expect(persisted.prompt).toBe('prompt')
    expect(persisted.inputImages).toEqual([{ id: imageA.id, dataUrl: '' }])
  })

  it('omits input when restart input restore is disabled', () => {
    const persisted = getPersistedState(persistedAppState({
      settings: { ...DEFAULT_SETTINGS, persistInputOnRestart: false },
      prompt: 'prompt',
      inputImages: [imageA],
    }), { includeAgentConversations: false })

    expect(persisted).not.toHaveProperty('prompt')
    expect(persisted).not.toHaveProperty('inputImages')
  })

  it('writes empty input when persisted input is cleared', () => {
    const persisted = getPersistedState(persistedAppState(), { includeAgentConversations: false })

    expect(persisted.prompt).toBe('')
    expect(persisted.inputImages).toEqual([])
  })
})

describe('agent conversation persistence', () => {
  it('omits agent conversations from localStorage state', () => {
    const conversation = agentConversation({
      rounds: [{
        id: 'round-a',
        index: 1,
        parentRoundId: null,
        userMessageId: 'user-a',
        assistantMessageId: 'assistant-a',
        prompt: '画一张图',
        inputImageIds: [],
        outputTaskIds: ['task-a'],
        responseOutput: [
          { type: 'message', content: [{ type: 'output_text', text: '已生成图片。' }] },
          { type: 'image_generation_call', id: 'image-call-a', result: 'large-base64-a' },
          { type: 'image_generation_call', id: 'image-call-b', result: { b64_json: 'large-base64-b', base64: 'large-base64-c', image: 'large-base64-d', data: 'large-base64-e' } },
        ],
        status: 'done',
        error: null,
        createdAt: 1,
        finishedAt: 2,
      }],
      messages: [
        { id: 'user-a', role: 'user', content: '画一张图', roundId: 'round-a', createdAt: 1 },
        { id: 'assistant-a', role: 'assistant', content: '已生成图片。', roundId: 'round-a', outputTaskIds: ['task-a'], createdAt: 2 },
      ],
    })

    const persisted = getPersistedState(persistedAppState({ agentConversations: [conversation] }), { includeAgentConversations: false })
    const serializedPersisted = JSON.stringify(persisted)

    expect('agentConversations' in persisted).toBe(false)
    expect(serializedPersisted).not.toContain('image_generation_call')
    expect(serializedPersisted).not.toContain('large-base64')
    expect(JSON.stringify(conversation)).toContain('large-base64-a')
  })

  it('strips generated image payloads when migrating old persisted state', () => {
    const migrated = migratePersistedState({
      settings: { ...DEFAULT_SETTINGS },
      agentConversations: [agentConversation({
        rounds: [{
          id: 'round-a',
          index: 1,
          parentRoundId: null,
          userMessageId: 'user-a',
          prompt: '画一张图',
          inputImageIds: [],
          outputTaskIds: ['task-a'],
          responseOutput: [
            { type: 'image_generation_call', id: 'image-call-a', result: 'legacy-base64-a' },
            { type: 'image_generation_call', id: 'image-call-b', result: { b64_json: 'legacy-base64-b', base64: 'legacy-base64-c' } },
          ],
          status: 'done',
          error: null,
          createdAt: 1,
          finishedAt: 2,
        }],
      })],
    })

    const serializedMigrated = JSON.stringify(migrated)
    expect(serializedMigrated).not.toContain('legacy-base64')
    expect(serializedMigrated).toContain('image_generation_call')
  })
})

describe('agent draft persistence', () => {
  it('persists the gallery draft while agent mode is active', () => {
    const galleryPrompt = 'gallery draft'
    const persisted = getPersistedState(persistedAppState({
      appMode: 'agent',
      galleryInputDraft: {
        prompt: galleryPrompt,
        inputImages: [imageB],
        maskDraft: null,
        maskEditorImageId: null,
      },
    }), { includeAgentConversations: false })

    expect(persisted.prompt).toBe(galleryPrompt)
    expect(persisted.inputImages).toEqual([{ id: imageB.id, dataUrl: '' }])
  })

  it('persists agent drafts separately from the gallery input draft', () => {
    const maskDraft = {
      targetImageId: imageA.id,
      maskDataUrl: 'data:image/png;base64,mask',
      updatedAt: 1,
    }
    const persisted = getPersistedState(persistedAppState({
      appMode: 'agent',
      agentConversations: [agentConversation({ id: 'conversation-a' })],
      activeAgentConversationId: 'conversation-a',
      prompt: 'agent draft',
      inputImages: [imageA],
      maskDraft,
      maskEditorImageId: imageA.id,
    }), { includeAgentConversations: false })

    expect(persisted).not.toHaveProperty('prompt')
    expect(persisted.agentInputDrafts['conversation-a']).toMatchObject({
      prompt: 'agent draft',
      inputImages: [{ id: imageA.id, dataUrl: '' }],
      maskDraft,
      maskEditorImageId: imageA.id,
    })
    expect(persisted.agentInputDrafts['conversation-a']?.updatedAt).toEqual(expect.any(Number))
  })
})
