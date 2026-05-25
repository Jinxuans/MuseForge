import type { AgentConversation, AppMode, InputImage, MaskDraft } from '../types'
import { remapImageMentionsForOrder } from '../lib/promptImageMentions'

const AGENT_INPUT_DRAFT_RETENTION_MS = 3 * 24 * 60 * 60 * 1000

export type AgentInputDraft = {
  prompt: string
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
  maskEditorImageId: string | null
  updatedAt?: number
}

type DraftState = {
  appMode: AppMode
  activeAgentConversationId: string | null
  agentInputDrafts: Record<string, AgentInputDraft>
  galleryInputDraft: AgentInputDraft | null
  prompt: string
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
  maskEditorImageId: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeInputImages(value: unknown): InputImage[] {
  if (!Array.isArray(value)) return []
  return value
    .map((img): InputImage | null => {
      if (!isRecord(img) || typeof img.id !== 'string') return null
      return {
        id: img.id,
        dataUrl: typeof img.dataUrl === 'string' ? img.dataUrl : '',
        sourceTaskId: typeof img.sourceTaskId === 'string' ? img.sourceTaskId : null,
        sourceImageId: typeof img.sourceImageId === 'string' ? img.sourceImageId : null,
      }
    })
    .filter((img): img is InputImage => img != null)
}

function normalizeMaskDraft(value: unknown): MaskDraft | null {
  if (!isRecord(value)) return null
  if (typeof value.targetImageId !== 'string' || typeof value.maskDataUrl !== 'string') return null
  return {
    targetImageId: value.targetImageId,
    maskDataUrl: value.maskDataUrl,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  }
}

export function normalizeAgentInputDraft(value: unknown, fallbackUpdatedAt = Date.now()): AgentInputDraft {
  const draft = isRecord(value) ? value : {}
  const updatedAt = typeof draft.updatedAt === 'number' && Number.isFinite(draft.updatedAt) ? draft.updatedAt : fallbackUpdatedAt
  return {
    prompt: typeof draft.prompt === 'string' ? draft.prompt : '',
    inputImages: normalizeInputImages(draft.inputImages),
    maskDraft: normalizeMaskDraft(draft.maskDraft),
    maskEditorImageId: typeof draft.maskEditorImageId === 'string' ? draft.maskEditorImageId : null,
    updatedAt,
  }
}

export function normalizeAgentInputDrafts(value: unknown, conversations: AgentConversation[]): Record<string, AgentInputDraft> {
  if (!isRecord(value)) return {}
  const conversationIds = new Set(conversations.map((conversation) => conversation.id))
  const drafts: Record<string, AgentInputDraft> = {}
  for (const [conversationId, draft] of Object.entries(value)) {
    if (!conversationIds.has(conversationId)) continue
    const normalized = normalizeAgentInputDraft(draft)
    if (!isEmptyAgentInputDraft(normalized)) drafts[conversationId] = normalized
  }
  return drafts
}

export function normalizeAgentInputDraftsByKey(value: unknown): Record<string, AgentInputDraft> {
  if (!isRecord(value)) return {}
  const drafts: Record<string, AgentInputDraft> = {}
  for (const [conversationId, draft] of Object.entries(value)) {
    const normalized = normalizeAgentInputDraft(draft)
    if (!isEmptyAgentInputDraft(normalized)) drafts[conversationId] = normalized
  }
  return drafts
}

export function cleanStaleAgentInputDrafts(drafts: Record<string, AgentInputDraft>, activeConversationId: string | null, now = Date.now()) {
  const cutoff = now - AGENT_INPUT_DRAFT_RETENTION_MS
  const next: Record<string, AgentInputDraft> = {}
  for (const [conversationId, draft] of Object.entries(drafts)) {
    if (conversationId === activeConversationId || (draft.updatedAt ?? now) >= cutoff) {
      next[conversationId] = draft
    }
  }
  return next
}

export function orderImagesWithMaskFirst(images: InputImage[], maskTargetImageId: string | null | undefined) {
  if (!maskTargetImageId) return images
  const maskIdx = images.findIndex((img) => img.id === maskTargetImageId)
  if (maskIdx <= 0) return images
  const next = [...images]
  const [maskImage] = next.splice(maskIdx, 1)
  next.unshift(maskImage)
  return next
}

export function clearInputDraftState(): Pick<AgentInputDraft, 'prompt' | 'inputImages' | 'maskDraft' | 'maskEditorImageId'> {
  return {
    prompt: '',
    inputImages: [],
    maskDraft: null,
    maskEditorImageId: null,
  }
}

function copyAgentInputDraft(draft: AgentInputDraft): AgentInputDraft {
  return {
    prompt: draft.prompt,
    inputImages: draft.inputImages.map((img) => ({ ...img })),
    maskDraft: draft.maskDraft ? { ...draft.maskDraft } : null,
    maskEditorImageId: draft.maskEditorImageId,
    updatedAt: draft.updatedAt ?? Date.now(),
  }
}

function getCurrentAgentInputDraft(state: Pick<DraftState, 'prompt' | 'inputImages' | 'maskDraft' | 'maskEditorImageId'>): AgentInputDraft {
  return {
    prompt: state.prompt,
    inputImages: state.inputImages,
    maskDraft: state.maskDraft,
    maskEditorImageId: state.maskEditorImageId,
    updatedAt: Date.now(),
  }
}

export function isEmptyAgentInputDraft(draft: AgentInputDraft) {
  return draft.prompt.length === 0 && draft.inputImages.length === 0 && !draft.maskDraft && !draft.maskEditorImageId
}

function setAgentInputDraft(drafts: Record<string, AgentInputDraft>, conversationId: string, draft: AgentInputDraft) {
  const next = { ...drafts }
  if (isEmptyAgentInputDraft(draft)) {
    delete next[conversationId]
  } else {
    next[conversationId] = copyAgentInputDraft(draft)
  }
  return next
}

export function saveActiveAgentInputDrafts(state: Pick<DraftState, 'appMode' | 'activeAgentConversationId' | 'agentInputDrafts' | 'prompt' | 'inputImages' | 'maskDraft' | 'maskEditorImageId'>) {
  if (state.appMode !== 'agent' || !state.activeAgentConversationId) return state.agentInputDrafts
  return setAgentInputDraft(state.agentInputDrafts, state.activeAgentConversationId, getCurrentAgentInputDraft(state))
}

export function saveGalleryInputDraft(state: Pick<DraftState, 'appMode' | 'galleryInputDraft' | 'prompt' | 'inputImages' | 'maskDraft' | 'maskEditorImageId'>) {
  if (state.appMode !== 'gallery') return state.galleryInputDraft
  const draft = getCurrentAgentInputDraft(state)
  return isEmptyAgentInputDraft(draft) ? null : copyAgentInputDraft(draft)
}

export function getPersistableInputImage(img: InputImage): InputImage {
  return {
    id: img.id,
    dataUrl: '',
    ...(img.sourceTaskId ? { sourceTaskId: img.sourceTaskId } : {}),
    ...(img.sourceImageId ? { sourceImageId: img.sourceImageId } : {}),
  }
}

export function getPersistableGalleryInputDraft(state: DraftState) {
  return saveGalleryInputDraft(state)
}

export function restoreGalleryInputDraftState(draft: AgentInputDraft | null): Pick<AgentInputDraft, 'prompt' | 'inputImages' | 'maskDraft' | 'maskEditorImageId'> {
  if (!draft) return clearInputDraftState()
  return {
    prompt: draft.prompt,
    inputImages: draft.inputImages.map((img) => ({ ...img })),
    maskDraft: draft.maskDraft ? { ...draft.maskDraft } : null,
    maskEditorImageId: draft.maskEditorImageId,
  }
}

export function restoreAgentInputDraftState(drafts: Record<string, AgentInputDraft>, conversationId: string | null): Pick<AgentInputDraft, 'prompt' | 'inputImages' | 'maskDraft' | 'maskEditorImageId'> {
  const draft = conversationId ? drafts[conversationId] : null
  return restoreGalleryInputDraftState(draft ?? null)
}

export function syncActiveInputDraft<T extends Partial<AgentInputDraft>>(
  state: DraftState,
  patch: T,
): T & { agentInputDrafts?: Record<string, AgentInputDraft>; galleryInputDraft?: AgentInputDraft | null } {
  const draft: AgentInputDraft = {
    prompt: patch.prompt ?? state.prompt,
    inputImages: patch.inputImages ?? state.inputImages,
    maskDraft: patch.maskDraft !== undefined ? patch.maskDraft : state.maskDraft,
    maskEditorImageId: patch.maskEditorImageId !== undefined ? patch.maskEditorImageId : state.maskEditorImageId,
  }
  if (state.appMode === 'gallery') {
    return {
      ...patch,
      galleryInputDraft: isEmptyAgentInputDraft(draft) ? null : copyAgentInputDraft(draft),
    }
  }
  if (!state.activeAgentConversationId) return patch
  return {
    ...patch,
    agentInputDrafts: setAgentInputDraft(state.agentInputDrafts, state.activeAgentConversationId, draft),
  }
}

export function addInputImageToDraftState(state: DraftState, img: InputImage) {
  if (state.inputImages.find((item) => item.id === img.id)) return state
  return syncActiveInputDraft(state, { inputImages: [...state.inputImages, img] })
}

export function replaceInputImageInDraftState(state: DraftState, idx: number, img: InputImage) {
  if (idx < 0 || idx >= state.inputImages.length) return { patch: state, removedImageId: null }
  const previous = state.inputImages[idx]
  if (!previous || previous.id === img.id) return { patch: state, removedImageId: null }
  if (state.inputImages.some((item, itemIdx) => itemIdx !== idx && item.id === img.id)) return { patch: state, removedImageId: null }
  const inputImages = state.inputImages.map((item, itemIdx) => itemIdx === idx ? img : item)
  const shouldClearMask = previous.id === state.maskDraft?.targetImageId
  return {
    patch: syncActiveInputDraft(state, {
      inputImages,
      prompt: remapImageMentionsForOrder(state.prompt, state.inputImages, inputImages, { [previous.id]: img.id }),
      ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
    }),
    removedImageId: previous.id,
  }
}

export function removeInputImageFromDraftState(state: DraftState, idx: number) {
  const removed = state.inputImages[idx]
  const inputImages = state.inputImages.filter((_, i) => i !== idx)
  const shouldClearMask = removed?.id === state.maskDraft?.targetImageId
  return syncActiveInputDraft(state, {
    inputImages,
    prompt: remapImageMentionsForOrder(state.prompt, state.inputImages, inputImages),
    ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
  })
}

export function clearInputImagesFromDraftState(state: DraftState) {
  return syncActiveInputDraft(state, {
    inputImages: [],
    prompt: remapImageMentionsForOrder(state.prompt, state.inputImages, []),
    maskDraft: null,
    maskEditorImageId: null,
  })
}

export function setInputImagesInDraftState(state: DraftState, imgs: InputImage[], options?: { equivalentImageIds?: Record<string, string> }) {
  const inputImages = orderImagesWithMaskFirst(imgs, state.maskDraft?.targetImageId)
  const shouldClearMask = Boolean(state.maskDraft) && !inputImages.some((img) => img.id === state.maskDraft?.targetImageId)
  return syncActiveInputDraft(state, {
    inputImages,
    prompt: remapImageMentionsForOrder(state.prompt, state.inputImages, inputImages, options?.equivalentImageIds),
    ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
  })
}

export function moveInputImageInDraftState(state: DraftState, fromIdx: number, toIdx: number) {
  const images = [...state.inputImages]
  if (fromIdx < 0 || fromIdx >= images.length) return state
  const maskTargetImageId = state.maskDraft?.targetImageId
  if (maskTargetImageId && images[fromIdx]?.id === maskTargetImageId) return state
  const minTargetIdx = maskTargetImageId && images.some((img) => img.id === maskTargetImageId) ? 1 : 0
  const targetIdx = Math.max(minTargetIdx, Math.min(images.length, toIdx))
  const insertIdx = fromIdx < targetIdx ? targetIdx - 1 : targetIdx
  if (insertIdx === fromIdx) return state
  const [moved] = images.splice(fromIdx, 1)
  images.splice(insertIdx, 0, moved)
  return syncActiveInputDraft(state, {
    inputImages: images,
    prompt: remapImageMentionsForOrder(state.prompt, state.inputImages, images),
  })
}

export function setMaskDraftInDraftState(state: DraftState, maskDraft: MaskDraft | null) {
  const inputImages = orderImagesWithMaskFirst(state.inputImages, maskDraft?.targetImageId)
  return syncActiveInputDraft(state, {
    maskDraft,
    inputImages,
    prompt: remapImageMentionsForOrder(state.prompt, state.inputImages, inputImages),
  })
}

export function getPersistableAgentInputDrafts(state: DraftState & { agentConversations: AgentConversation[] }) {
  const drafts = saveActiveAgentInputDrafts(state)
  const conversationIds = new Set(state.agentConversations.map((conversation) => conversation.id))
  const persistable: Record<string, AgentInputDraft> = {}
  for (const [conversationId, draft] of Object.entries(drafts)) {
    if (!conversationIds.has(conversationId) || isEmptyAgentInputDraft(draft)) continue
    persistable[conversationId] = {
      ...copyAgentInputDraft(draft),
      inputImages: draft.inputImages.map(getPersistableInputImage),
    }
  }
  return persistable
}
