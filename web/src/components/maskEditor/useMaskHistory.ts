import { useCallback, useRef, useState, type RefObject } from 'react'

type HistoryState = {
  undo: number
  redo: number
}

type UseMaskHistoryOptions = {
  maskCanvasRef: RefObject<HTMLCanvasElement | null>
  onMaskRestored: () => void
}

const MAX_UNDO_STACK_SIZE = 40

export function useMaskHistory({ maskCanvasRef, onMaskRestored }: UseMaskHistoryOptions) {
  const undoStackRef = useRef<ImageData[]>([])
  const redoStackRef = useRef<ImageData[]>([])
  const [historyState, setHistoryState] = useState<HistoryState>({ undo: 0, redo: 0 })

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      undo: undoStackRef.current.length,
      redo: redoStackRef.current.length,
    })
  }, [])

  const restoreSnapshot = useCallback((imageData: ImageData) => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !ctx) return

    ctx.putImageData(imageData, 0, 0)
    onMaskRestored()
  }, [maskCanvasRef, onMaskRestored])

  const resetHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    syncHistoryState()
  }, [syncHistoryState])

  const pushUndoSnapshot = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    if (!canvas || !ctx) return

    undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    if (undoStackRef.current.length > MAX_UNDO_STACK_SIZE) undoStackRef.current.shift()
    redoStackRef.current = []
    syncHistoryState()
  }, [maskCanvasRef, syncHistoryState])

  const cancelLastUndoSnapshot = useCallback(() => {
    const previous = undoStackRef.current.pop()
    if (previous) restoreSnapshot(previous)
    syncHistoryState()
  }, [restoreSnapshot, syncHistoryState])

  const undo = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    const previous = undoStackRef.current.pop()
    if (!canvas || !ctx || !previous) return

    redoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    restoreSnapshot(previous)
    syncHistoryState()
  }, [maskCanvasRef, restoreSnapshot, syncHistoryState])

  const redo = useCallback(() => {
    const canvas = maskCanvasRef.current
    const ctx = canvas?.getContext('2d', { willReadFrequently: true })
    const next = redoStackRef.current.pop()
    if (!canvas || !ctx || !next) return

    undoStackRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
    restoreSnapshot(next)
    syncHistoryState()
  }, [maskCanvasRef, restoreSnapshot, syncHistoryState])

  return {
    cancelLastUndoSnapshot,
    historyState,
    pushUndoSnapshot,
    redo,
    resetHistory,
    undo,
  }
}
