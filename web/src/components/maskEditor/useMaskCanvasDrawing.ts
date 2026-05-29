import { useCallback, useEffect, useRef, type RefObject } from 'react'

import type { Point, ViewTransform } from '../../lib/viewportTransform'

export type MaskEditorTool = 'brush' | 'eraser'

type UseMaskCanvasDrawingOptions = {
  baseFrameRef: RefObject<HTMLDivElement | null>
  brushSize: number
  cursorCanvasRef: RefObject<HTMLCanvasElement | null>
  maskCanvasRef: RefObject<HTMLCanvasElement | null>
  previewCanvasRef: RefObject<HTMLCanvasElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  tool: MaskEditorTool
  viewTransformRef: RefObject<ViewTransform>
}

export function useMaskCanvasDrawing({
  baseFrameRef,
  brushSize,
  cursorCanvasRef,
  maskCanvasRef,
  previewCanvasRef,
  stageRef,
  tool,
  viewTransformRef,
}: UseMaskCanvasDrawingOptions) {
  const previewFrameRef = useRef<number | null>(null)

  const renderPreviewNow = useCallback(() => {
    const maskCanvas = maskCanvasRef.current
    const previewCanvas = previewCanvasRef.current
    if (!maskCanvas || !previewCanvas) return

    const previewCtx = previewCanvas.getContext('2d')
    if (!previewCtx) return

    previewFrameRef.current = null
    previewCtx.save()
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height)
    previewCtx.globalCompositeOperation = 'source-over'
    previewCtx.fillStyle = 'rgba(59, 130, 246, 0.58)'
    previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height)
    previewCtx.globalCompositeOperation = 'destination-out'
    previewCtx.drawImage(maskCanvas, 0, 0)
    previewCtx.restore()
  }, [maskCanvasRef, previewCanvasRef])

  const renderPreview = useCallback(() => {
    if (previewFrameRef.current != null) return
    previewFrameRef.current = window.requestAnimationFrame(renderPreviewNow)
  }, [renderPreviewNow])

  const cancelPreviewRender = useCallback(() => {
    if (previewFrameRef.current == null) return
    window.cancelAnimationFrame(previewFrameRef.current)
    previewFrameRef.current = null
  }, [])

  const updateCursor = useCallback((point: Point | null) => {
    const cursorCanvas = cursorCanvasRef.current
    const stage = stageRef.current
    const frame = baseFrameRef.current
    const maskCanvas = maskCanvasRef.current
    const ctx = cursorCanvas?.getContext('2d')
    if (!cursorCanvas || !ctx || !stage || !frame || !maskCanvas) return

    const dpr = window.devicePixelRatio || 1
    const width = stage.clientWidth
    const height = stage.clientHeight
    if (cursorCanvas.width !== Math.round(width * dpr) || cursorCanvas.height !== Math.round(height * dpr)) {
      cursorCanvas.width = Math.round(width * dpr)
      cursorCanvas.height = Math.round(height * dpr)
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    if (!point) return

    const scale = viewTransformRef.current.scale
    const stageRect = stage.getBoundingClientRect()
    const frameRect = frame.getBoundingClientRect()
    const frameLeft = frameRect.left - stageRect.left
    const frameTop = frameRect.top - stageRect.top
    const x = frameLeft + (point.x / maskCanvas.width) * frame.clientWidth * scale + viewTransformRef.current.x
    const y = frameTop + (point.y / maskCanvas.height) * frame.clientHeight * scale + viewTransformRef.current.y
    const radius = (brushSize / 2 / maskCanvas.width) * frame.clientWidth * scale

    ctx.save()
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    ctx.stroke()

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)'
    ctx.beginPath()
    ctx.arc(x, y, radius + 1, 0, Math.PI * 2)
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(x, y, Math.max(0, radius - 1), 0, Math.PI * 2)
    ctx.stroke()

    const crosshairSize = 5
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    ctx.moveTo(x - crosshairSize, y)
    ctx.lineTo(x + crosshairSize, y)
    ctx.moveTo(x, y - crosshairSize)
    ctx.lineTo(x, y + crosshairSize)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'
    ctx.beginPath()
    ctx.moveTo(x - crosshairSize, y)
    ctx.lineTo(x + crosshairSize, y)
    ctx.moveTo(x, y - crosshairSize)
    ctx.lineTo(x, y + crosshairSize)
    ctx.stroke()
    ctx.restore()
  }, [baseFrameRef, brushSize, cursorCanvasRef, maskCanvasRef, stageRef, viewTransformRef])

  const getViewportCenterCanvasPoint = useCallback((): Point | null => {
    const frame = baseFrameRef.current
    const maskCanvas = maskCanvasRef.current
    if (!frame || !maskCanvas) return null

    const transform = viewTransformRef.current
    return {
      x: ((frame.clientWidth / 2 - transform.x) / transform.scale / frame.clientWidth) * maskCanvas.width,
      y: ((frame.clientHeight / 2 - transform.y) / transform.scale / frame.clientHeight) * maskCanvas.height,
    }
  }, [baseFrameRef, maskCanvasRef, viewTransformRef])

  const drawAt = useCallback((point: Point, nextTool = tool) => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.save()
    ctx.globalCompositeOperation = nextTool === 'brush' ? 'destination-out' : 'source-over'
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    renderPreview()
  }, [brushSize, maskCanvasRef, renderPreview, tool])

  const drawStroke = useCallback((from: Point, to: Point, nextTool = tool) => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.save()
    ctx.globalCompositeOperation = nextTool === 'brush' ? 'destination-out' : 'source-over'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = brushSize
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x, to.y)
    ctx.stroke()
    ctx.restore()
    renderPreview()
  }, [brushSize, maskCanvasRef, renderPreview, tool])

  useEffect(() => cancelPreviewRender, [cancelPreviewRender])

  return {
    cancelPreviewRender,
    drawAt,
    drawStroke,
    getViewportCenterCanvasPoint,
    renderPreview,
    updateCursor,
  }
}
