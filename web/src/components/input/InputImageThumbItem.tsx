import type { DragEvent, MutableRefObject, RefObject, TouchEvent } from 'react'
import type { InputImage } from '../../types'
import { getSafeBoundingClientRect } from '../../lib/domRect'
import { ButtonTooltip } from './InputBarParts'

export type TouchDragState = { index: number | null; startX: number; startY: number; moved: boolean }
export type TouchDragPreview = { src: string; x: number; y: number } | null

type InputImageThumbItemProps = {
  clearImageHintTimer: () => void
  displaySrc: string
  getDataTransferDragIndex: (event: DragEvent<HTMLDivElement>) => number | null
  getTouchDropIndex: (touch: React.Touch) => number | null
  hideImageHint: () => void
  hideLockedImageHint: () => void
  imageDragIndex: number | null
  imageDragIndexRef: MutableRefObject<number | null>
  imageDragOverIndex: number | null
  imageDragOverIndexRef: MutableRefObject<number | null>
  imageDragPreviewRef: MutableRefObject<HTMLElement | null>
  imageHintId: string | null
  imageTouchDragRef: MutableRefObject<TouchDragState>
  img: InputImage
  idx: number
  inputImages: InputImage[]
  isMobile: boolean
  isMaskTarget: boolean
  maskConflictNoticeShownRef: MutableRefObject<boolean>
  maskTargetImage: InputImage | null
  moveInputImage: (fromIdx: number, toIdx: number) => void
  onEditReferenceImage: (img: InputImage, idx: number, isMaskTarget: boolean) => void
  onInsertImageMention: (idx: number) => void
  onOpenLightbox: (imageId: string, imageIds: string[]) => void
  onOpenMaskEditor: (imageId: string) => void
  removeInputImage: (idx: number) => void
  resetImageDrag: () => void
  setImageDragIndex: (idx: number | null) => void
  setImageDragTarget: (idx: number | null, clientX?: number) => void
  setImageHintId: (id: string | null) => void
  setTouchDragPreview: (preview: TouchDragPreview) => void
  showImageHintUntilRelease: (id: string) => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
  suppressImageClickRef: MutableRefObject<boolean>
  textareaRef: RefObject<HTMLDivElement | null>
}

export default function InputImageThumbItem({
  clearImageHintTimer,
  displaySrc,
  getDataTransferDragIndex,
  getTouchDropIndex,
  hideImageHint,
  hideLockedImageHint,
  imageDragIndex,
  imageDragIndexRef,
  imageDragOverIndex,
  imageDragOverIndexRef,
  imageDragPreviewRef,
  imageHintId,
  imageTouchDragRef,
  img,
  idx,
  inputImages,
  isMobile,
  isMaskTarget,
  maskConflictNoticeShownRef,
  maskTargetImage,
  moveInputImage,
  onEditReferenceImage,
  onInsertImageMention,
  onOpenLightbox,
  onOpenMaskEditor,
  removeInputImage,
  resetImageDrag,
  setImageDragIndex,
  setImageDragTarget,
  setImageHintId,
  setTouchDragPreview,
  showImageHintUntilRelease,
  showToast,
  suppressImageClickRef,
  textareaRef,
}: InputImageThumbItemProps) {
  const canEdit = !maskTargetImage || isMaskTarget
  const imageHintText = isMaskTarget ? '遮罩图必须为第一张图' : ''
  const isImageDragging = imageDragIndex === idx
  const isLast = idx === inputImages.length - 1
  const showDropBefore = imageDragOverIndex === idx && imageDragIndex !== idx
  const showDropAfter = imageDragOverIndex === inputImages.length && isLast && imageDragIndex !== idx

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

  return (
    <div
      data-input-image-index={idx}
      className={`relative group inline-block h-[52px] w-[52px] shrink-0 self-start transition-opacity ${isImageDragging ? 'opacity-40' : ''}`}
      style={{ touchAction: isMaskTarget ? 'auto' : 'none' }}
      draggable={!isMobile}
      onMouseLeave={hideImageHint}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragEnd={resetImageDrag}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onContextMenu={(e) => {
        e.preventDefault()
        textareaRef.current?.focus()
        onInsertImageMention(idx)
      }}
    >
      <ButtonTooltip
        visible={imageHintId === img.id && Boolean(imageHintText) && (!isMobile || isMaskTarget)}
        text={imageHintText}
      />
      {showDropBefore && (
        <div className="absolute -left-[5px] top-0 bottom-0 w-[2px] bg-blue-500 rounded-full z-40 shadow-sm pointer-events-none" />
      )}
      {showDropAfter && (
        <div className="absolute -right-[5px] top-0 bottom-0 w-[2px] bg-blue-500 rounded-full z-40 shadow-sm pointer-events-none" />
      )}
      <div
        className={`relative w-[52px] h-[52px] rounded-xl overflow-hidden shadow-sm cursor-grab active:cursor-grabbing select-none ${
          isMaskTarget
            ? 'border-2 border-blue-500'
            : 'border border-gray-200 dark:border-white/[0.08]'
        }`}
        onClick={() => {
          if (suppressImageClickRef.current) return
          if (isMaskTarget) {
            onOpenMaskEditor(img.id)
            return
          }
          if (maskTargetImage && !maskConflictNoticeShownRef.current) {
            maskConflictNoticeShownRef.current = true
            showToast('只能有一张遮罩图', 'info')
          }
          onOpenLightbox(img.id, inputImages.map((image) => image.id))
        }}
      >
        {displaySrc && (
          <div className="h-full w-full overflow-hidden rounded-xl">
            <img
              src={displaySrc}
              className="w-full h-full object-cover hover:opacity-90 transition-opacity pointer-events-none"
              alt=""
            />
          </div>
        )}
        {isMaskTarget && (
          <span className="absolute left-1 top-1 rounded bg-blue-500/90 px-1.5 py-0.5 text-[8px] leading-none text-white font-bold tracking-wider backdrop-blur-sm z-10 pointer-events-none">
            MASK
          </span>
        )}
        <span className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/55 text-[9px] font-semibold text-white backdrop-blur-sm z-10 pointer-events-none">
          {idx + 1}
        </span>
        {canEdit && (
          <button
            className="absolute inset-0 w-full h-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer z-20 focus:outline-none border-none"
            onClick={(e) => {
              e.stopPropagation()
              onEditReferenceImage(img, idx, isMaskTarget)
            }}
            title={isMaskTarget ? '编辑遮罩' : '编辑'}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </div>
      {!isMaskTarget && (
        <span
          className="absolute right-0 top-0 flex h-5 w-5 translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-md transition-opacity hover:bg-red-600 group-hover:opacity-100 z-30"
          onClick={(e) => {
            e.stopPropagation()
            removeInputImage(idx)
          }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      )}
    </div>
  )
}
