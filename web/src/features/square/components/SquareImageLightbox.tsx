import { useEffect } from 'react'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon } from '../../../shared/ui/icons'

export interface SquareLightboxImage {
  src: string
  title: string
}

interface SquareImageLightboxProps {
  images: SquareLightboxImage[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

export default function SquareImageLightbox({ images, index, onIndexChange, onClose }: SquareImageLightboxProps) {
  const image = images[index]

  useEffect(() => {
    if (!image) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') onIndexChange((index - 1 + images.length) % images.length)
      if (event.key === 'ArrowRight') onIndexChange((index + 1) % images.length)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [image, images.length, index, onClose, onIndexChange])

  if (!image) return null

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/88 p-4 backdrop-blur-sm" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
        aria-label="关闭预览"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onIndexChange((index - 1 + images.length) % images.length)
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="上一张"
          >
            <ChevronLeftIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onIndexChange((index + 1) % images.length)
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition hover:bg-white/20"
            aria-label="下一张"
          >
            <ChevronRightIcon className="h-6 w-6" />
          </button>
        </>
      )}
      <img
        src={image.src}
        alt={image.title}
        className="max-h-[86vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      />
      <div className="absolute bottom-4 left-1/2 max-w-[80vw] -translate-x-1/2 truncate rounded-full bg-black/55 px-4 py-2 text-sm text-white">
        {image.title}
      </div>
    </div>
  )
}
