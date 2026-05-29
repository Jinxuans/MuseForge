import type { MutableRefObject, RefObject } from 'react'
import type { InputImage } from '../../types'
import { ButtonTooltip } from './InputBarParts'
import { createInputImageThumbDragHandlers, type InputImageDragControls } from './useInputImageDrag'

const THUMB_SURFACE_BASE_CLASS = 'relative w-[52px] h-[52px] rounded-xl overflow-hidden shadow-sm cursor-grab active:cursor-grabbing select-none'

function EditIcon() {
  return (
    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  )
}

function RemoveIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

type InputImageThumbItemProps = {
  clearImageHintTimer: () => void
  displaySrc: string
  hideImageHint: () => void
  hideLockedImageHint: () => void
  imageHintId: string | null
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
  setImageHintId: (id: string | null) => void
  showImageHintUntilRelease: (id: string) => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
  textareaRef: RefObject<HTMLDivElement | null>
} & Omit<InputImageDragControls, 'touchDragPreview'>

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
  const imageIds = inputImages.map((image) => image.id)
  const dragHandlers = createInputImageThumbDragHandlers({
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
  })

  const handleOpenImage = () => {
    if (suppressImageClickRef.current) return
    if (isMaskTarget) {
      onOpenMaskEditor(img.id)
      return
    }
    if (maskTargetImage && !maskConflictNoticeShownRef.current) {
      maskConflictNoticeShownRef.current = true
      showToast('只能有一张遮罩图', 'info')
    }
    onOpenLightbox(img.id, imageIds)
  }

  const renderImageSurface = () => (
    <div
      className={`${THUMB_SURFACE_BASE_CLASS} ${
        isMaskTarget
          ? 'border-2 border-blue-500'
          : 'border border-gray-200 dark:border-white/[0.08]'
      }`}
      onClick={handleOpenImage}
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
          <EditIcon />
        </button>
      )}
    </div>
  )

  return (
    <div
      data-input-image-index={idx}
      className={`relative group inline-block h-[52px] w-[52px] shrink-0 self-start transition-opacity ${isImageDragging ? 'opacity-40' : ''}`}
      style={{ touchAction: isMaskTarget ? 'auto' : 'none' }}
      draggable={!isMobile}
      onMouseLeave={hideImageHint}
      onDragStart={dragHandlers.handleDragStart}
      onDragOver={dragHandlers.handleDragOver}
      onDrop={dragHandlers.handleDrop}
      onDragEnd={resetImageDrag}
      onTouchStart={dragHandlers.handleTouchStart}
      onTouchMove={dragHandlers.handleTouchMove}
      onTouchEnd={dragHandlers.handleTouchEnd}
      onTouchCancel={dragHandlers.handleTouchCancel}
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
      {renderImageSurface()}
      {!isMaskTarget && (
        <span
          className="absolute right-0 top-0 flex h-5 w-5 translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow-md transition-opacity hover:bg-red-600 group-hover:opacity-100 z-30"
          onClick={(e) => {
            e.stopPropagation()
            removeInputImage(idx)
          }}
        >
          <RemoveIcon />
        </span>
      )}
    </div>
  )
}
