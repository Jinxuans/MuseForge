import { useCallback, useRef, useState, type RefObject } from 'react'

import {
  clampViewTransform,
  getComfortableInitialTransform,
  getPinchTransform,
  type Point,
  type ViewTransform,
} from '../../lib/viewportTransform'
import {
  centroid,
  DEFAULT_VIEW_TRANSFORM,
  distance,
  firstTwoPointers,
} from './maskEditorCanvas'

interface PinchGesture {
  startTransform: ViewTransform
  startCentroid: Point
  startDistance: number
}

interface PanGesture {
  pointerId: number
  startPoint: Point
  startTransform: ViewTransform
}

type UseMaskViewportGesturesOptions = {
  baseFrameRef: RefObject<HTMLDivElement | null>
  pointerPositionsRef: RefObject<Map<number, Point>>
  stageRef: RefObject<HTMLDivElement | null>
}

export function useMaskViewportGestures({
  baseFrameRef,
  pointerPositionsRef,
  stageRef,
}: UseMaskViewportGesturesOptions) {
  const pinchGestureRef = useRef<PinchGesture | null>(null)
  const panGestureRef = useRef<PanGesture | null>(null)
  const viewTransformRef = useRef<ViewTransform>(DEFAULT_VIEW_TRANSFORM)
  const [viewTransform, setViewTransform] = useState<ViewTransform>(DEFAULT_VIEW_TRANSFORM)
  const [isPanning, setIsPanning] = useState(false)

  const commitViewTransform = useCallback((nextTransform: ViewTransform) => {
    const frame = baseFrameRef.current
    const clamped = frame
      ? clampViewTransform(nextTransform, { width: frame.clientWidth, height: frame.clientHeight })
      : nextTransform
    viewTransformRef.current = clamped
    setViewTransform(clamped)
  }, [baseFrameRef])

  const resetViewTransform = useCallback(() => {
    const frame = baseFrameRef.current
    const stage = stageRef.current
    const isCompactLayout = window.matchMedia('(max-width: 1023px)').matches
    if (!frame || !stage) {
      commitViewTransform(DEFAULT_VIEW_TRANSFORM)
      return
    }

    commitViewTransform(getComfortableInitialTransform(
      { width: frame.clientWidth, height: frame.clientHeight },
      { width: stage.clientWidth, height: stage.clientHeight },
      isCompactLayout,
    ))
  }, [baseFrameRef, commitViewTransform, stageRef])

  const beginPinchGesture = useCallback(() => {
    const pointers = firstTwoPointers(pointerPositionsRef.current)
    const frame = baseFrameRef.current
    if (!pointers || !frame) return

    const rect = frame.getBoundingClientRect()
    const startCentroid = centroid(pointers[0], pointers[1])
    pinchGestureRef.current = {
      startTransform: viewTransformRef.current,
      startCentroid: {
        x: startCentroid.x - rect.left,
        y: startCentroid.y - rect.top,
      },
      startDistance: distance(pointers[0], pointers[1]),
    }
  }, [baseFrameRef, pointerPositionsRef])

  const updatePinchGesture = useCallback(() => {
    const pointers = firstTwoPointers(pointerPositionsRef.current)
    const gesture = pinchGestureRef.current
    const frame = baseFrameRef.current
    if (!pointers || !gesture || !frame) return false

    const rect = frame.getBoundingClientRect()
    const nextCentroid = centroid(pointers[0], pointers[1])
    commitViewTransform(getPinchTransform({
      startTransform: gesture.startTransform,
      startCentroid: gesture.startCentroid,
      nextCentroid: {
        x: nextCentroid.x - rect.left,
        y: nextCentroid.y - rect.top,
      },
      startDistance: gesture.startDistance,
      nextDistance: distance(pointers[0], pointers[1]),
      viewportSize: { width: frame.clientWidth, height: frame.clientHeight },
    }))
    return true
  }, [baseFrameRef, commitViewTransform, pointerPositionsRef])

  const updatePinchAfterPointerRelease = useCallback(() => {
    if (!pinchGestureRef.current) return
    if (pointerPositionsRef.current.size >= 2) beginPinchGesture()
    else pinchGestureRef.current = null
  }, [beginPinchGesture, pointerPositionsRef])

  const startPanGesture = useCallback((pointerId: number, startPoint: Point) => {
    panGestureRef.current = {
      pointerId,
      startPoint,
      startTransform: viewTransformRef.current,
    }
    setIsPanning(true)
  }, [])

  const updatePanGesture = useCallback((pointerId: number, point: Point) => {
    const panGesture = panGestureRef.current
    if (panGesture?.pointerId !== pointerId) return false

    commitViewTransform({
      scale: panGesture.startTransform.scale,
      x: panGesture.startTransform.x + point.x - panGesture.startPoint.x,
      y: panGesture.startTransform.y + point.y - panGesture.startPoint.y,
    })
    return true
  }, [commitViewTransform])

  const finishPanGesture = useCallback((pointerId: number) => {
    if (panGestureRef.current?.pointerId !== pointerId) return false
    panGestureRef.current = null
    setIsPanning(false)
    return true
  }, [])

  const clearViewportGestures = useCallback(() => {
    pointerPositionsRef.current.clear()
    pinchGestureRef.current = null
    panGestureRef.current = null
    setIsPanning(false)
  }, [pointerPositionsRef])

  const resetViewportState = useCallback(() => {
    clearViewportGestures()
    viewTransformRef.current = DEFAULT_VIEW_TRANSFORM
    setViewTransform(DEFAULT_VIEW_TRANSFORM)
  }, [clearViewportGestures])

  return {
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
  }
}
