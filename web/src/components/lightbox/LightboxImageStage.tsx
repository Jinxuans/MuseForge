interface LightboxImageStageProps {
  src: string
  imageId: string
  maskPreviewSrc?: string
  scale: number
  tx: number
  ty: number
  isDragging: boolean
}

export default function LightboxImageStage({
  src,
  imageId,
  maskPreviewSrc,
  scale,
  tx,
  ty,
  isDragging,
}: LightboxImageStageProps) {
  return (
    <div className="relative animate-zoom-in">
      <div
        className="relative flex items-center justify-center"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition: isDragging ? 'none' : 'transform 0.2s ease-out',
          willChange: 'transform',
        }}
      >
        <img
          src={src}
          data-image-id={imageId}
          className="saveable-image max-w-[85vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
          onDragStart={(e) => e.preventDefault()}
          alt=""
        />
        {maskPreviewSrc && (
          <img
            src={maskPreviewSrc}
            className="absolute inset-0 w-full h-full object-contain rounded-lg pointer-events-none"
            alt=""
          />
        )}
      </div>
    </div>
  )
}
