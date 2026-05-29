import { CopyIcon } from '../../shared/ui/icons'

type ReferenceImagesSectionProps = {
  show: boolean
  imageIds: string[]
  imageSrcs: Record<string, string>
  maskTargetId: string | null
  maskPreviewSrc: string
  isAgentEditTool: boolean
  onCopyInputImage: () => void
  onOpenLightbox: (imageId: string, imageIds: string[]) => void
}

export default function ReferenceImagesSection({
  show,
  imageIds,
  imageSrcs,
  maskTargetId,
  maskPreviewSrc,
  isAgentEditTool,
  onCopyInputImage,
  onOpenLightbox,
}: ReferenceImagesSectionProps) {
  if (!show) return null

  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          参考图
        </h3>
        {imageIds.length > 0 && (
          <button
            onClick={onCopyInputImage}
            className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06] transition"
            title="复制参考图"
          >
            <CopyIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {imageIds.length > 0 ? (
        <>
          <div className="flex gap-2 flex-wrap">
            {imageIds.map((imgId) => {
              const isMaskTarget = imgId === maskTargetId
              const displaySrc = (isMaskTarget && maskPreviewSrc) ? maskPreviewSrc : (imageSrcs[imgId] || '')
              return (
                <div key={imgId} className="relative group inline-block">
                  <div
                    className={`relative w-16 h-16 rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition ${
                      isMaskTarget ? 'border-blue-500 border-2 shadow-sm' : 'border-gray-200 dark:border-white/[0.08]'
                    }`}
                    onClick={() => onOpenLightbox(imgId, imageIds)}
                  >
                    {displaySrc && (
                      <img
                        src={displaySrc}
                        data-image-id={imgId}
                        className="w-full h-full object-cover"
                        alt=""
                      />
                    )}
                    {isMaskTarget && (
                      <span className="absolute left-1 top-1 rounded bg-blue-500/90 px-1.5 py-0.5 text-[8px] leading-none text-white font-bold tracking-wider backdrop-blur-sm z-10 pointer-events-none">
                        MASK
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {isAgentEditTool && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              由模型自主选择，可能包含其他图片
            </div>
          )}
        </>
      ) : (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          由模型自主选择
        </div>
      )}
    </div>
  )
}
