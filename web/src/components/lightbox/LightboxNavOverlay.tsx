interface LightboxNavOverlayProps {
  showNav: boolean
  isZoomed: boolean
  showZoomBadge: boolean
  zoomPercent: number
  currentIndex: number
  total: number
  onPrev: () => void
  onNext: () => void
}

const navBtnClass =
  'absolute top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-all z-10 backdrop-blur-sm'

export default function LightboxNavOverlay({
  showNav,
  isZoomed,
  showZoomBadge,
  zoomPercent,
  currentIndex,
  total,
  onPrev,
  onNext,
}: LightboxNavOverlayProps) {
  return (
    <>
      {showNav && !isZoomed && (
        <>
          <button
            className={`${navBtnClass} left-3 sm:left-5`}
            onClick={(e) => { e.stopPropagation(); onPrev() }}
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            className={`${navBtnClass} right-3 sm:right-5`}
            onClick={(e) => { e.stopPropagation(); onNext() }}
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {showZoomBadge && isZoomed && zoomPercent !== 100 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
          <span className="px-3 py-1.5 bg-black/50 text-white/80 text-xs rounded-full backdrop-blur-sm transition-opacity duration-500">
            {zoomPercent}%
          </span>
        </div>
      )}
      {showNav && !isZoomed && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
          <span className="px-3 py-1.5 bg-black/50 text-white/80 text-xs rounded-full backdrop-blur-sm">
            {currentIndex + 1} / {total}
          </span>
        </div>
      )}
    </>
  )
}
