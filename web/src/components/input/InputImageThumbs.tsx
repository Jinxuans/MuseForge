import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import type { InputImage } from '../../types'
import InputImageThumbItem from './InputImageThumbItem'
import { type InputImageDragControls } from './useInputImageDrag'

type InputImageThumbsProps = {
  inputImages: InputImage[]
  imagesRef: RefObject<HTMLDivElement | null>
  maskTargetImage: InputImage | null
  maskTargetImageId: string | null
  maskPreviewUrl: string
  imageHintId: string | null
  isMobile: boolean
  textareaRef: RefObject<HTMLDivElement | null>
  setImageHintId: (id: string | null) => void
  showImageHintUntilRelease: (id: string) => void
  hideImageHint: () => void
  hideLockedImageHint: () => void
  clearImageHintTimer: () => void
  moveInputImage: (fromIdx: number, toIdx: number) => void
  removeInputImage: (idx: number) => void
  onClearAll: () => void
  onEditReferenceImage: (img: InputImage, idx: number, isMaskTarget: boolean) => void
  onInsertImageMention: (idx: number) => void
  onOpenMaskEditor: (imageId: string) => void
  onOpenLightbox: (imageId: string, imageIds: string[]) => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
} & InputImageDragControls

export default function InputImageThumbs({
  inputImages,
  imagesRef,
  maskTargetImage,
  maskTargetImageId,
  maskPreviewUrl,
  touchDragPreview,
  onClearAll,
  ...thumbItemProps
}: InputImageThumbsProps) {
  return (
    <div ref={imagesRef}>
      <div className="grid grid-cols-[repeat(auto-fill,52px)] justify-between gap-x-2 gap-y-3 mb-3">
        {inputImages.map((img, idx) => {
          const isMaskTarget = maskTargetImageId === img.id
          const displaySrc = isMaskTarget && maskPreviewUrl ? maskPreviewUrl : img.dataUrl
          return (
            <InputImageThumbItem
              key={img.id}
              img={img}
              idx={idx}
              inputImages={inputImages}
              isMaskTarget={isMaskTarget}
              maskTargetImage={maskTargetImage}
              displaySrc={displaySrc}
              {...thumbItemProps}
            />
          )
        })}
        <button
          onClick={onClearAll}
          className="w-[52px] h-[52px] rounded-xl border border-dashed border-gray-300 dark:border-white/[0.08] flex flex-col items-center justify-center gap-0.5 text-gray-400 dark:text-gray-500 hover:text-red-500 hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-950/30 transition-all cursor-pointer flex-shrink-0"
          title={maskTargetImage ? '清空遮罩主图、参考图和遮罩' : '清空全部参考图'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          <span className="text-[8px] leading-none">{maskTargetImage ? '清空全部' : '清空'}</span>
        </button>
      </div>
      {touchDragPreview?.src && createPortal(
        <div
          className="fixed z-[140] h-[52px] w-[52px] overflow-hidden rounded-xl shadow-xl pointer-events-none opacity-90"
          style={{ left: touchDragPreview.x, top: touchDragPreview.y, transform: 'translate(-50%, -50%)' }}
        >
          <img src={touchDragPreview.src} className="h-full w-full object-cover" alt="" />
        </div>,
        document.body,
      )}
    </div>
  )
}
