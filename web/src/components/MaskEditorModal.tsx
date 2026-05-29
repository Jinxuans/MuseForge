import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react'
import { createPortal } from 'react-dom'
import { ensureImageCached, useStore } from '../store'
import { loadImage } from '../lib/canvasImage'
import { prepareMaskTargetDataUrl } from '../lib/maskPreprocess'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import {
  zoomAtPoint,
  type Point,
} from '../lib/viewportTransform'
import {
  drawMaskImageToCanvas,
  fillWhiteMask,
  getCanvasPoint,
} from './maskEditor/maskEditorCanvas'
import MaskEditorHeader from './maskEditor/MaskEditorHeader'
import MaskEditorToolbar from './maskEditor/MaskEditorToolbar'
import { useMaskCanvasDrawing } from './maskEditor/useMaskCanvasDrawing'
import { useMaskHistory } from './maskEditor/useMaskHistory'
import { useMaskSaveLifecycle } from './maskEditor/useMaskSaveLifecycle'
import { useMaskViewportGestures } from './maskEditor/useMaskViewportGestures'

type Tool = 'brush' | 'eraser'

interface CanvasSize {
  width: number
  height: number
}

interface SliderAnchor {
  left: number
  bottom: number
}

export default function MaskEditorModal() {
  const imageId = useStore((s) => s.maskEditorImageId)
  const setMaskEditorImageId = useStore((s) => s.setMaskEditorImageId)
  const maskDraft = useStore((s) => s.maskDraft)
  const setMaskDraft = useStore((s) => s.setMaskDraft)
  const clearMaskDraft = useStore((s) => s.clearMaskDraft)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)

  const imageCanvasRef = useRef<HTMLCanvasElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const cursorCanvasRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const baseFrameRef = useRef<HTMLDivElement>(null)
  const brushSizeControlRef = useRef<HTMLDivElement>(null)
  const brushSizeButtonRef = useRef<HTMLButtonElement>(null)
  const brushSizePanelRef = useRef<HTMLDivElement>(null)
  const maskInfoTimerRef = useRef<number | null>(null)
  const activePointerIdRef = useRef<number | null>(null)
  const lastPointRef = useRef<Point | null>(null)
  const pointerPositionsRef = useRef<Map<number, Point>>(new Map())

  const [sourceDataUrl, setSourceDataUrl] = useState('')
  const [size, setSize] = useState<CanvasSize | null>(null)
  const [tool, setTool] = useState<Tool>('brush')
  const [brushSize, setBrushSize] = useState(64)
  const [showBrushControls, setShowBrushControls] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null)
  const [isPointerOverCanvas, setIsPointerOverCanvas] = useState(false)
  const [isAltKeyPressed, setIsAltKeyPressed] = useState(false)
  const [sliderAnchor, setSliderAnchor] = useState<SliderAnchor | null>(null)
  const [showMaskInfo, setShowMaskInfo] = useState(false)
  const isCanvasReady = Boolean(sourceDataUrl && size && !isLoading)
  const { handleSave, isSaving } = useMaskSaveLifecycle({
    imageId,
    isCanvasReady,
    maskCanvasRef,
    setMaskDraft,
    setMaskEditorImageId,
    showToast,
    sourceDataUrl,
  })
  const {
    beginPinchGesture,
    clearViewportGestures,
    commitViewTransform,
    finishPanGesture,
    isPanning,
    resetViewTransform,
    resetViewportState,
    startPanGesture,
    updatePanGesture,
    updatePinchAfterPointerRelease,
    updatePinchGesture,
    viewTransform,
    viewTransformRef,
  } = useMaskViewportGestures({
    baseFrameRef,
    pointerPositionsRef,
    stageRef,
  })
  const {
    cancelPreviewRender,
    drawAt,
    drawStroke,
    getViewportCenterCanvasPoint,
    renderPreview,
    updateCursor,
  } = useMaskCanvasDrawing({
    baseFrameRef,
    brushSize,
    cursorCanvasRef,
    maskCanvasRef,
    previewCanvasRef,
    stageRef,
    tool,
    viewTransformRef,
  })
  const {
    cancelLastUndoSnapshot,
    historyState,
    pushUndoSnapshot,
    redo: handleRedo,
    resetHistory,
    undo: handleUndo,
  } = useMaskHistory({
    maskCanvasRef,
    onMaskRestored: renderPreview,
  })

  const close = () => {
    if (isSaving) return
    setMaskEditorImageId(null)
  }
  useCloseOnEscape(Boolean(imageId), close)
  usePreventBackgroundScroll(Boolean(imageId))

  useEffect(() => () => {
    if (maskInfoTimerRef.current != null) {
      window.clearTimeout(maskInfoTimerRef.current)
    }
  }, [])

  const showMaskInfoPopover = () => setShowMaskInfo(true)

  const hideMaskInfoPopover = () => {
    setShowMaskInfo(false)
    clearMaskInfoTimer()
  }

  const clearMaskInfoTimer = () => {
    if (maskInfoTimerRef.current != null) {
      window.clearTimeout(maskInfoTimerRef.current)
      maskInfoTimerRef.current = null
    }
  }

  const startMaskInfoTouch = () => {
    maskInfoTimerRef.current = window.setTimeout(() => {
      setShowMaskInfo(true)
      maskInfoTimerRef.current = null
    }, 450)
  }

  const handleRemoveMask = () => {
    setConfirmDialog({
      title: '移除遮罩',
      message: '确定要撤销对这张图片的所有涂抹并移除遮罩吗？',
      tone: 'danger',
      action: () => {
        clearMaskDraft()
        setMaskEditorImageId(null)
        showToast('已移除遮罩', 'success')
      },
    })
  }

  function cancelActiveStroke() {
    if (activePointerIdRef.current == null) return

    cancelLastUndoSnapshot()
    activePointerIdRef.current = null
    lastPointRef.current = null
  }

  useEffect(() => {
    if (!imageId) {
      cancelPreviewRender()
      setSourceDataUrl('')
      setSize(null)
      setIsLoading(false)
      resetViewportState()
      resetHistory()
      return
    }

    const targetImageId = imageId
    let cancelled = false
    setIsLoading(true)
    setSourceDataUrl('')
    setSize(null)
    resetHistory()

    async function loadCanvases() {
      try {
        const dataUrl = await ensureImageCached(targetImageId)
        if (cancelled) return
        if (!dataUrl) {
          showToast('图片已不存在，无法编辑遮罩', 'error')
          setMaskEditorImageId(null)
          return
        }

        const preparedTarget = await prepareMaskTargetDataUrl(dataUrl)
        const image = await loadImage(preparedTarget.dataUrl)
        if (cancelled) return

        const nextSize = { width: preparedTarget.width, height: preparedTarget.height }
        const imageCanvas = imageCanvasRef.current
        const previewCanvas = previewCanvasRef.current
        const maskCanvas = maskCanvasRef.current
        if (!imageCanvas || !previewCanvas || !maskCanvas) return

        for (const canvas of [imageCanvas, previewCanvas, maskCanvas]) {
          canvas.width = nextSize.width
          canvas.height = nextSize.height
        }

        const imageCtx = imageCanvas.getContext('2d')
        if (!imageCtx) throw new Error('当前浏览器不支持 Canvas')
        imageCtx.clearRect(0, 0, imageCanvas.width, imageCanvas.height)
        imageCtx.drawImage(image, 0, 0)

        fillWhiteMask(maskCanvas)

        if (maskDraft?.targetImageId === targetImageId) {
          try {
            const draftImage = await loadImage(maskDraft.maskDataUrl)
            if (cancelled) return
            drawMaskImageToCanvas(draftImage, maskCanvas)
          } catch (err) {
            fillWhiteMask(maskCanvas)
            showToast(
              `遮罩草稿加载失败，已重置为空白遮罩：${err instanceof Error ? err.message : String(err)}`,
              'error',
            )
          }
        }

        renderPreview()
        setSourceDataUrl(preparedTarget.dataUrl)
        setSize(nextSize)
        if (preparedTarget.wasResized) {
          showToast(
            `已为遮罩编辑按官方要求调整图片尺寸：\n${preparedTarget.originalWidth}×${preparedTarget.originalHeight} → ${preparedTarget.width}×${preparedTarget.height}`,
            'info',
          )
        }
        requestAnimationFrame(() => resetViewTransform())
      } catch (err) {
        if (!cancelled) {
          showToast(err instanceof Error ? err.message : String(err), 'error')
          setMaskEditorImageId(null)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void loadCanvases()

    return () => {
      cancelled = true
      cancelPreviewRender()
      activePointerIdRef.current = null
      lastPointRef.current = null
      clearViewportGestures()
    }
  }, [cancelPreviewRender, clearViewportGestures, imageId, maskDraft, renderPreview, resetHistory, resetViewportState, setMaskEditorImageId, showToast])

  useEffect(() => {
    if (isAltKeyPressed) {
      updateCursor(null)
    } else if (showBrushControls && !isPointerOverCanvas && size) {
      updateCursor(getViewportCenterCanvasPoint())
    } else {
      updateCursor(hoverPoint)
    }
  }, [brushSize, viewTransform, hoverPoint, isPointerOverCanvas, showBrushControls, size, isAltKeyPressed])

  useEffect(() => {
    if (!imageId) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey) setIsAltKeyPressed(true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setIsAltKeyPressed(false)
    }
    const handleBlur = () => setIsAltKeyPressed(false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [imageId])

  useEffect(() => {
    if (!showBrushControls) return

    const closeBrushControls = (event: PointerEvent) => {
      const control = brushSizeControlRef.current
      const panel = brushSizePanelRef.current
      if (control?.contains(event.target as Node)) return
      if (panel?.contains(event.target as Node)) return
      setShowBrushControls(false)
      setSliderAnchor(null)
    }

    document.addEventListener('pointerdown', closeBrushControls, true)
    return () => document.removeEventListener('pointerdown', closeBrushControls, true)
  }, [showBrushControls])

  useEffect(() => {
    const frame = baseFrameRef.current
    if (!frame || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      commitViewTransform(viewTransformRef.current)
    })
    observer.observe(frame)
    return () => observer.disconnect()
  }, [size])

  if (!imageId) return null

  const isReady = isCanvasReady
  const canUndo = historyState.undo > 0 && isReady && !isSaving
  const canRedo = historyState.redo > 0 && isReady && !isSaving
  const isZoomed = viewTransform.scale > 1.01 || Math.abs(viewTransform.x) > 1 || Math.abs(viewTransform.y) > 1

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!isReady || isSaving || (event.pointerType !== 'touch' && event.button !== 0)) return
    event.preventDefault()
    setShowBrushControls(false)
    setSliderAnchor(null)
    const canvas = event.currentTarget

    if (event.altKey) {
      if (!canvas.hasPointerCapture(event.pointerId)) {
        canvas.setPointerCapture(event.pointerId)
      }
      startPanGesture(event.pointerId, { x: event.clientX, y: event.clientY })
      updateCursor(null)
      return
    }

    pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!canvas.hasPointerCapture(event.pointerId)) {
      canvas.setPointerCapture(event.pointerId)
    }

    if (pointerPositionsRef.current.size >= 2) {
      cancelActiveStroke()
      beginPinchGesture()
      return
    }

    activePointerIdRef.current = event.pointerId
    pushUndoSnapshot()
    const point = getCanvasPoint(canvas, event)
    lastPointRef.current = point
    drawAt(point)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(event.currentTarget, event)
    if (event.pointerType !== 'touch') {
      setIsPointerOverCanvas(true)
      setHoverPoint(point)
      updateCursor(event.altKey || isAltKeyPressed ? null : point)
    }

    if (updatePanGesture(event.pointerId, { x: event.clientX, y: event.clientY })) {
      event.preventDefault()
      return
    }

    if (pointerPositionsRef.current.has(event.pointerId)) {
      pointerPositionsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    }
    if (updatePinchGesture()) {
      event.preventDefault()
      return
    }
    if (activePointerIdRef.current !== event.pointerId || !lastPointRef.current || !isReady || isSaving) return
    event.preventDefault()
    drawStroke(lastPointRef.current, point)
    lastPointRef.current = point
  }

  const handlePointerLeave = () => {
    setIsPointerOverCanvas(false)
    setHoverPoint(null)
    updateCursor(null)
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.altKey || !isReady || isSaving) return

    const frame = baseFrameRef.current
    if (!frame) return

    event.preventDefault()
    const rect = frame.getBoundingClientRect()
    const point = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
    const scaleFactor = Math.exp(-event.deltaY * 0.002)
    commitViewTransform(zoomAtPoint(
      viewTransformRef.current,
      point,
      viewTransformRef.current.scale * scaleFactor,
      { width: frame.clientWidth, height: frame.clientHeight },
    ))
  }

  const finishStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    pointerPositionsRef.current.delete(event.pointerId)

    updatePinchAfterPointerRelease()
    finishPanGesture(event.pointerId)

    if (activePointerIdRef.current === event.pointerId) {
      activePointerIdRef.current = null
      lastPointRef.current = null
      if (hoverPoint) updateCursor(hoverPoint)
    }
  }

  const handleClear = () => {
    const canvas = maskCanvasRef.current
    if (!canvas || !isReady || isSaving) return

    pushUndoSnapshot()
    fillWhiteMask(canvas)
    renderPreview()
  }

  const toggleBrushControls = () => {
    const rect = brushSizeButtonRef.current?.getBoundingClientRect()
    if (!rect) return

    setIsPointerOverCanvas(false)
    setHoverPoint(null)
    if (size) updateCursor(getViewportCenterCanvasPoint())

    setSliderAnchor({
      left: rect.left + rect.width / 2,
      bottom: window.innerHeight - rect.top + 8,
    })
    setShowBrushControls((value) => !value)
  }

  return (
    <>
      <div data-no-drag-select className="fixed inset-0 z-[80] flex flex-col bg-gray-50 dark:bg-gray-900 animate-modal-in">
      <MaskEditorHeader
        imageId={imageId}
        isReady={isReady}
        isSaving={isSaving}
        maskDraft={maskDraft}
        showMaskInfo={showMaskInfo}
        onClose={close}
        onSave={handleSave}
        onRemoveMask={handleRemoveMask}
        onShowMaskInfo={showMaskInfoPopover}
        onHideMaskInfo={hideMaskInfoPopover}
        onStartMaskInfoTouch={startMaskInfoTouch}
        onClearMaskInfoTimer={clearMaskInfoTimer}
      />

      {/* Workspace */}
      <div ref={stageRef} className="flex-1 relative flex items-center justify-center overflow-hidden bg-gray-100/50 dark:bg-black/50 p-0 pb-[76px] sm:p-6 sm:pb-[100px]" style={{ containerType: 'size' }}>
        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/50 text-sm text-gray-500 backdrop-blur-sm dark:bg-gray-900/50 dark:text-gray-300">
            正在载入图片...
          </div>
        )}
        <div
          ref={baseFrameRef}
          className="relative max-h-full max-w-full sm:rounded-xl shadow-inner sm:ring-1 ring-black/5 touch-none dark:bg-black/50 dark:ring-white/5"
          onWheel={handleWheel}
          style={{
            aspectRatio: size ? `${size.width} / ${size.height}` : '1 / 1',
            width: size ? `min(100%, 100cqh * ${size.width / size.height})` : '520px',
            maxHeight: '100%',
          }}
        >
            <div
              className="absolute inset-0 will-change-transform"
              style={{
                transform: `matrix(${viewTransform.scale}, 0, 0, ${viewTransform.scale}, ${viewTransform.x}, ${viewTransform.y})`,
                transformOrigin: '0 0',
              }}
            >
              <canvas ref={imageCanvasRef} className="absolute inset-0 h-full w-full" />
              <canvas ref={previewCanvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />
              <canvas
                ref={maskCanvasRef}
                className="absolute inset-0 h-full w-full touch-none select-none opacity-0"
                style={{ cursor: isPanning ? 'grabbing' : isAltKeyPressed ? 'grab' : hoverPoint ? 'none' : 'crosshair' }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishStroke}
                onPointerCancel={finishStroke}
                onLostPointerCapture={finishStroke}
                onPointerLeave={handlePointerLeave}
              />
            </div>
          </div>
          <canvas ref={cursorCanvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />
        </div>

        <MaskEditorToolbar
          tool={tool}
          setTool={setTool}
          brushSize={brushSize}
          showBrushControls={showBrushControls}
          isReady={isReady}
          isSaving={isSaving}
          isZoomed={isZoomed}
          canUndo={canUndo}
          canRedo={canRedo}
          brushSizeControlRef={brushSizeControlRef}
          brushSizeButtonRef={brushSizeButtonRef}
          onToggleBrushControls={toggleBrushControls}
          onUndo={handleUndo}
          onRedo={handleRedo}
          onResetView={resetViewTransform}
          onClear={handleClear}
        />
      </div>
      {showBrushControls && sliderAnchor && createPortal(
        <div
          ref={brushSizePanelRef}
          className="fixed z-[100] h-44 w-14 -translate-x-1/2 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700"
          style={{ left: sliderAnchor.left, bottom: sliderAnchor.bottom }}
        >
          <input
            type="range"
            min={8}
            max={220}
            value={brushSize}
            onChange={(e) => {
              const nextSize = Number(e.target.value)
              setBrushSize(nextSize)
              if (!isPointerOverCanvas && size) updateCursor(getViewportCenterCanvasPoint())
            }}
            className="absolute left-1/2 top-1/2 h-5 w-32 -translate-x-1/2 -translate-y-1/2 -rotate-90 accent-blue-500 cursor-ns-resize"
            disabled={!isReady || isSaving}
          />
        </div>,
        document.body,
      )}
    </>
  )
}
