import type { AgentConversation, InputImage, TaskRecord } from '../types'
import type { AgentInputDraft } from '../store/agentInputDrafts'
import { isEmptyAgentInputDraft } from '../store/agentInputDrafts'
import { addTaskReferencedImageIds } from '../store/imageReferences'
import { cacheImage, scheduleThumbnailBackfill } from '../store/imageCache'
import { getAllImageIds, getImage, deleteImage } from '../lib/db'
import { remapImageMentionsForOrder } from '../lib/promptImageMentions'

export type BootstrapImageState = {
  inputImages: InputImage[]
  galleryInputDraft: AgentInputDraft | null
  agentConversations: AgentConversation[]
  agentInputDrafts: Record<string, AgentInputDraft>
  tasks: TaskRecord[]
}

export async function cleanupBootstrapImageReferences(state: BootstrapImageState) {
  const referencedIds = collectBootstrapReferencedImageIds(state)
  const imageIds = await getAllImageIds()
  const referencedImageIds: string[] = []
  for (const imgId of imageIds) {
    if (referencedIds.has(imgId)) {
      referencedImageIds.push(imgId)
    } else {
      await deleteImage(imgId)
    }
  }
  scheduleThumbnailBackfill(referencedImageIds)
}

export async function restorePersistedInputImages(inputImages: InputImage[]) {
  const restoredImages = await restoreInputImages(inputImages)
  return {
    restoredImages,
    changed: restoredImages.length !== inputImages.length || restoredImages.some((img, index) => img.dataUrl !== inputImages[index]?.dataUrl),
  }
}

export async function restorePersistedGalleryDraft(galleryInputDraft: AgentInputDraft | null) {
  if (!galleryInputDraft) return { draft: null, changed: false }

  const restoredImages = await restoreInputImages(galleryInputDraft.inputImages)
  const shouldClearMask = Boolean(galleryInputDraft.maskDraft) && !restoredImages.some((img) => img.id === galleryInputDraft.maskDraft?.targetImageId)
  const restoredDraft: AgentInputDraft = {
    ...galleryInputDraft,
    inputImages: restoredImages,
    prompt: remapImageMentionsForOrder(galleryInputDraft.prompt, galleryInputDraft.inputImages, restoredImages),
    ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
  }
  const changed =
    restoredImages.length !== galleryInputDraft.inputImages.length ||
    restoredImages.some((img, index) => img.dataUrl !== galleryInputDraft.inputImages[index]?.dataUrl) ||
    shouldClearMask
  return {
    draft: isEmptyAgentInputDraft(restoredDraft) ? null : restoredDraft,
    changed,
  }
}

export async function restorePersistedAgentInputDrafts(agentInputDrafts: Record<string, AgentInputDraft>) {
  const restoredDrafts: Record<string, AgentInputDraft> = {}
  let changed = false
  for (const [conversationId, draft] of Object.entries(agentInputDrafts)) {
    const restoredImages = await restoreInputImages(draft.inputImages)
    const shouldClearMask = Boolean(draft.maskDraft) && !restoredImages.some((img) => img.id === draft.maskDraft?.targetImageId)
    const restoredDraft: AgentInputDraft = {
      ...draft,
      inputImages: restoredImages,
      prompt: remapImageMentionsForOrder(draft.prompt, draft.inputImages, restoredImages),
      ...(shouldClearMask ? { maskDraft: null, maskEditorImageId: null } : {}),
    }
    if (!isEmptyAgentInputDraft(restoredDraft)) restoredDrafts[conversationId] = restoredDraft
    if (
      restoredImages.length !== draft.inputImages.length ||
      restoredImages.some((img, index) => img.dataUrl !== draft.inputImages[index]?.dataUrl) ||
      shouldClearMask
    ) {
      changed = true
    }
  }
  return { restoredDrafts, changed }
}

function collectBootstrapReferencedImageIds(state: BootstrapImageState) {
  const referencedIds = new Set<string>()
  for (const img of state.inputImages) referencedIds.add(img.id)
  if (state.galleryInputDraft) {
    for (const img of state.galleryInputDraft.inputImages) referencedIds.add(img.id)
  }
  for (const draft of Object.values(state.agentInputDrafts)) {
    for (const img of draft.inputImages) referencedIds.add(img.id)
  }
  for (const conversation of state.agentConversations) {
    for (const round of conversation.rounds) {
      for (const id of round.inputImageIds) referencedIds.add(id)
    }
  }
  for (const task of state.tasks) addTaskReferencedImageIds(referencedIds, task)
  return referencedIds
}

async function restoreInputImages(inputImages: InputImage[]) {
  const restoredImages: InputImage[] = []
  for (const img of inputImages) {
    if (img.dataUrl) {
      restoredImages.push(img)
      cacheImage(img.id, img.dataUrl)
      continue
    }
    const storedImage = await getImage(img.id)
    if (storedImage?.dataUrl) {
      restoredImages.push({ ...img, dataUrl: storedImage.dataUrl })
      cacheImage(img.id, storedImage.dataUrl)
    }
  }
  return restoredImages
}
