import type { StateCreator } from 'zustand'
import { dismissAllTooltips } from '../../lib/tooltipDismiss'
import type { InputImage } from '../../types'
import type { AppState } from '../appState'
import {
  addInputImageToDraftState,
  clearInputImagesFromDraftState,
  moveInputImageInDraftState,
  removeInputImageFromDraftState,
  replaceInputImageInDraftState,
  setInputImagesInDraftState,
  setMaskDraftInDraftState,
  syncActiveInputDraft,
} from '../agent/agentInputDrafts'
import { deleteCachedImage } from '../images/imageCache'

type StoreSet = Parameters<StateCreator<AppState>>[0]

type InputSlice = Pick<
  AppState,
  | 'prompt'
  | 'setPrompt'
  | 'inputImages'
  | 'addInputImage'
  | 'replaceInputImage'
  | 'removeInputImage'
  | 'clearInputImages'
  | 'setInputImages'
  | 'moveInputImage'
  | 'maskDraft'
  | 'setMaskDraft'
  | 'clearMaskDraft'
  | 'maskEditorImageId'
  | 'setMaskEditorImageId'
  | 'galleryInputDraft'
>

type InputSliceDeps = {
  deleteImageIfUnreferenced: (imageId: string) => Promise<void>
}

export function createInputSlice(set: StoreSet, deps: InputSliceDeps): InputSlice {
  return {
    prompt: '',
    setPrompt: (prompt) => set((state) => syncActiveInputDraft(state, { prompt })),
    inputImages: [],
    addInputImage: (img) => set((state) => addInputImageToDraftState(state, img)),
    replaceInputImage: (idx, img) => {
      let removedImageId: string | null = null
      set((state) => {
        const result = replaceInputImageInDraftState(state, idx, img)
        removedImageId = result.removedImageId
        return result.patch
      })
      if (removedImageId) void deps.deleteImageIfUnreferenced(removedImageId)
    },
    removeInputImage: (idx) => set((state) => removeInputImageFromDraftState(state, idx)),
    clearInputImages: () =>
      set((state) => {
        for (const img of state.inputImages) deleteCachedImage(img.id)
        return clearInputImagesFromDraftState(state)
      }),
    setInputImages: (imgs: InputImage[], options) => set((state) => setInputImagesInDraftState(state, imgs, options)),
    moveInputImage: (fromIdx, toIdx) => set((state) => moveInputImageInDraftState(state, fromIdx, toIdx)),
    maskDraft: null,
    setMaskDraft: (maskDraft) => set((state) => setMaskDraftInDraftState(state, maskDraft)),
    clearMaskDraft: () => set((state) => syncActiveInputDraft(state, { maskDraft: null })),
    maskEditorImageId: null,
    setMaskEditorImageId: (maskEditorImageId) => {
      if (maskEditorImageId) dismissAllTooltips()
      set((state) => syncActiveInputDraft(state, { maskEditorImageId }))
    },
    galleryInputDraft: null,
  }
}
