import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import { replaceMaskTargetImage } from '../../lib/maskPreprocess'
import { useStore, type AppState } from '../../store'
import { createSavedMaskDraft } from './maskEditorCanvas'

type UseMaskSaveLifecycleOptions = {
  imageId: string | null
  isCanvasReady: boolean
  maskCanvasRef: RefObject<HTMLCanvasElement | null>
  setMaskDraft: AppState['setMaskDraft']
  setMaskEditorImageId: AppState['setMaskEditorImageId']
  showToast: AppState['showToast']
  sourceDataUrl: string
}

export function useMaskSaveLifecycle({
  imageId,
  isCanvasReady,
  maskCanvasRef,
  setMaskDraft,
  setMaskEditorImageId,
  showToast,
  sourceDataUrl,
}: UseMaskSaveLifecycleOptions) {
  const [isSaving, setIsSaving] = useState(false)
  const saveTokenRef = useRef(0)
  const sessionIdRef = useRef(0)
  const activeSessionIdRef = useRef(0)

  useEffect(() => {
    if (!imageId) {
      activeSessionIdRef.current = 0
      return
    }

    const nextSessionId = sessionIdRef.current + 1
    sessionIdRef.current = nextSessionId
    activeSessionIdRef.current = nextSessionId

    return () => {
      if (activeSessionIdRef.current === nextSessionId) {
        activeSessionIdRef.current = 0
      }
    }
  }, [imageId])

  const handleSave = useCallback(async () => {
    const canvas = maskCanvasRef.current
    const savingSessionId = activeSessionIdRef.current
    if (!canvas || !sourceDataUrl || !imageId || !isCanvasReady || isSaving || !savingSessionId) return

    const token = ++saveTokenRef.current
    const savingImageId = imageId
    try {
      setIsSaving(true)
      const saved = await createSavedMaskDraft({
        canvas,
        sourceDataUrl,
      })
      if (
        saveTokenRef.current !== token ||
        activeSessionIdRef.current !== savingSessionId ||
        useStore.getState().maskEditorImageId !== savingImageId
      ) return

      const latestStore = useStore.getState()
      latestStore.setInputImages(
        replaceMaskTargetImage(latestStore.inputImages, savingImageId, saved.workingTarget),
        { equivalentImageIds: { [savingImageId]: saved.workingTarget.id } },
      )
      setMaskDraft(saved.maskDraft)
      setMaskEditorImageId(null)
      showToast('遮罩已保存', 'success')
    } catch (err) {
      if (
        saveTokenRef.current !== token ||
        activeSessionIdRef.current !== savingSessionId ||
        useStore.getState().maskEditorImageId !== savingImageId
      ) return
      showToast(err instanceof Error ? err.message : String(err), 'error')
    } finally {
      if (saveTokenRef.current === token) setIsSaving(false)
    }
  }, [imageId, isCanvasReady, isSaving, maskCanvasRef, setMaskDraft, setMaskEditorImageId, showToast, sourceDataUrl])

  return {
    handleSave,
    isSaving,
  }
}
