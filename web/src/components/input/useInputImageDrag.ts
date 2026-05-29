import { useEffect, useRef, useState, type DragEvent, type MutableRefObject, type Touch, type TouchEvent } from 'react'
import type { InputImage } from '../../types'
import { getSafeBoundingClientRect } from '../../lib/domRect'

export type TouchDragState = { index: number | null; startX: number; startY: number; moved: boolean }
export type TouchDragPreview = { src: string; x: number; y: number } | null

type UseInputImageDragArgs = {
  hideImageHint: () => void
  inputImageCount: number
  maskTargetImage: InputImage | null
  showImageHint: (id: string) => void
}

export function useInputImageDrag({
  hideImageHint,
  inputImageCount,
  maskTargetImage,
  showImageHint,
}: UseInputImageDragArgs) {
  const [imageDragIndex, setImageDragIndex] = useState<number | null>(null)
  const [imageDragOverIndex, setImageDragOverIndex] = useState<number | null>(null)
  const [touchDragPreview, setTouchDragPreview] = useState<TouchDragPreview>(null)
  const imageDragIndexRef = useRef<number | null>(null)
  const imageTouchDragRef = useRef({ index: null as number | null, startX: 0, startY: 0, moved: false })
  const imageDragOverIndexRef = useRef<number | null>(null)
  const imageDragPreviewRef = useRef<HTMLElement | null>(null)
  const suppressImageClickRef = useRef(false)
  const maskConflictNoticeShownRef = useRef(false)

  const getTouchDropIndex = (touch: Touch) => {
    const target = document
      .elementFromPoint(touch.clientX, touch.clientY)
      ?.closest<HTMLElement>('[data-input-image-index]')
    if (!target) return null
    const idx = Number(target.dataset.inputImageIndex)
    if (!Number.isInteger(idx)) return null
    const rect = getSafeBoundingClientRect(target)
    if (!rect) return null
    return touch.clientX < rect.left + rect.width / 2 ? idx : idx + 1
  }

  const normalizeImageDropIndex = (idx: number) => {
    const minIdx = maskTargetImage ? 1 : 0
    return Math.max(minIdx, Math.min(inputImageCount, idx))
  }

  const isBeforeMaskDropArea = (clientX: number) => {
    if (!maskTargetImage) return false
    const maskEl = document.querySelector<HTMLElement>('[data-input-image-index="0"]')
    if (!maskEl) return false
    const rect = getSafeBoundingClientRect(maskEl)
    if (!rect) return false
    return clientX < rect.left + rect.width / 2
  }

  const resetImageDrag = () => {
    setImageDragIndex(null)
    setImageDragOverIndex(null)
    imageDragIndexRef.current = null
    imageDragOverIndexRef.current = null
    imageTouchDragRef.current = { index: null, startX: 0, startY: 0, moved: false }
    setTouchDragPreview(null)
    imageDragPreviewRef.current?.remove()
    imageDragPreviewRef.current = null
    hideImageHint()
  }

  const getDataTransferDragIndex = (e: DragEvent) => {
    const value = e.dataTransfer.getData('text/plain')
    const idx = Number(value)
    return Number.isInteger(idx) ? idx : null
  }

  const setImageDragTarget = (idx: number | null, clientX?: number) => {
    const fromIdx = imageDragIndexRef.current
    if (fromIdx !== null && maskTargetImage && (idx === 0 || (clientX != null && isBeforeMaskDropArea(clientX)))) {
      showImageHint(maskTargetImage.id)
      imageDragOverIndexRef.current = null
      setImageDragOverIndex(null)
      return
    }

    if (fromIdx !== null) hideImageHint()
    const normalizedIdx = idx == null ? null : normalizeImageDropIndex(idx)
    const isNoopTarget = fromIdx !== null && normalizedIdx !== null && (normalizedIdx === fromIdx || normalizedIdx === fromIdx + 1)
    const nextIdx = isNoopTarget ? null : normalizedIdx
    imageDragOverIndexRef.current = nextIdx
    setImageDragOverIndex(nextIdx)
  }

  useEffect(() => {
    if (!touchDragPreview) return
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior
    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
    }
  }, [touchDragPreview])

  return {
    getDataTransferDragIndex,
    getTouchDropIndex,
    imageDragIndex,
    imageDragIndexRef,
    imageDragOverIndex,
    imageDragOverIndexRef,
    imageDragPreviewRef,
    imageTouchDragRef,
    maskConflictNoticeShownRef,
    resetImageDrag,
    setImageDragIndex,
    setImageDragTarget,
    setTouchDragPreview,
    suppressImageClickRef,
    touchDragPreview,
  }
}

export type InputImageDragControls = ReturnType<typeof useInputImageDrag>

type CreateInputImageThumbDragHandlersArgs = {
  clearImageHintTimer: () => void
  displaySrc: string
  getDataTransferDragIndex: (event: DragEvent<HTMLDivElement>) => number | null
  getTouchDropIndex: (touch: Touch) => number | null
  hideImageHint: () => void
  hideLockedImageHint: () => void
  imageDragIndexRef: MutableRefObject<number | null>
  imageDragOverIndexRef: MutableRefObject<number | null>
  imageDragPreviewRef: MutableRefObject<HTMLElement | null>
  imageTouchDragRef: MutableRefObject<TouchDragState>
  img: InputImage
  idx: number
  isMaskTarget: boolean
  moveInputImage: (fromIdx: number, toIdx: number) => void
  resetImageDrag: () => void
  setImageDragIndex: (idx: number | null) => void
  setImageDragTarget: (idx: number | null, clientX?: number) => void
  setImageHintId: (id: string | null) => void
  setTouchDragPreview: (preview: TouchDragPreview) => void
  showImageHintUntilRelease: (id: string) => void
  suppressImageClickRef: MutableRefObject<boolean>
}

export function createInputImageThumbDragHandlers({
  clearImageHintTimer,
  displaySrc,
  getDataTransferDragIndex,
  getTouchDropIndex,
  hideImageHint,
  hideLockedImageHint,
  imageDragIndexRef,
  imageDragOverIndexRef,
  imageDragPreviewRef,
  imageTouchDragRef,
  img,
  idx,
  isMaskTarget,
  moveInputImage,
  resetImageDrag,
  setImageDragIndex,
  setImageDragTarget,
  setImageHintId,
  setTouchDragPreview,
  showImageHintUntilRelease,
  suppressImageClickRef,
}: CreateInputImageThumbDragHandlersArgs) {
  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    if (isMaskTarget) {
      showImageHintUntilRelease(img.id)
      e.preventDefault()
      return
    }
    hideImageHint()
    imageDragIndexRef.current = idx
    setImageDragIndex(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
    const preview = document.createElement('div')
    preview.style.cssText = 'position:fixed;left:-1000px;top:-1000px;width:52px;height:52px;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,0.25);'
    const previewImg = document.createElement('img')
    previewImg.src = displaySrc
    previewImg.style.cssText = 'width:52px;height:52px;object-fit:cover;display:block;'
    preview.appendChild(previewImg)
    document.body.appendChild(preview)
    imageDragPreviewRef.current = preview
    e.dataTransfer.setDragImage(preview, 26, 26)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const fromIdx = imageDragIndexRef.current
    if (fromIdx === null || fromIdx === idx) return
    const rect = getSafeBoundingClientRect(e.currentTarget)
    if (!rect) return
    setImageDragTarget(e.clientX < rect.left + rect.width / 2 ? idx : idx + 1, e.clientX)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const fromIdx = imageDragIndexRef.current ?? getDataTransferDragIndex(e)
    const toIdx = imageDragOverIndexRef.current
    if (fromIdx !== null && toIdx !== null) {
      moveInputImage(fromIdx, toIdx)
    }
    resetImageDrag()
  }

  const handleTouchStart = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0]
    if (isMaskTarget) {
      imageTouchDragRef.current = { index: idx, startX: touch.clientX, startY: touch.clientY, moved: false }
      return
    }
    imageDragIndexRef.current = idx
    imageTouchDragRef.current = { index: idx, startX: touch.clientX, startY: touch.clientY, moved: false }
    setTouchDragPreview(null)
  }

  const handleTouchMove = (e: TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0]
    const touchDrag = imageTouchDragRef.current
    if (touchDrag.index === null) return

    if (isMaskTarget) {
      if (Math.abs(touch.clientX - touchDrag.startX) > 6 || Math.abs(touch.clientY - touchDrag.startY) > 6) {
        e.preventDefault()
        showImageHintUntilRelease(img.id)
      }
      return
    }

    touchDrag.moved = true
    clearImageHintTimer()
    setImageHintId(null)
    suppressImageClickRef.current = true
    e.preventDefault()
    setImageDragIndex(touchDrag.index)
    setTouchDragPreview({ src: displaySrc, x: touch.clientX, y: touch.clientY })
    const dropIndex = getTouchDropIndex(touch)
    setImageDragTarget(dropIndex, touch.clientX)
  }

  const handleTouchEnd = (e: TouchEvent<HTMLDivElement>) => {
    const touchDrag = imageTouchDragRef.current
    clearImageHintTimer()
    if (touchDrag.index !== null && imageDragOverIndexRef.current !== null) {
      e.preventDefault()
      moveInputImage(touchDrag.index, imageDragOverIndexRef.current)
      window.setTimeout(() => {
        suppressImageClickRef.current = false
      }, 0)
    }
    resetImageDrag()
    hideLockedImageHint()
  }

  const handleTouchCancel = () => {
    suppressImageClickRef.current = false
    hideLockedImageHint()
    resetImageDrag()
  }

  return {
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleTouchCancel,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStart,
  }
}
