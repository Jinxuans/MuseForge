import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import type { AgentConversation, InputImage, TaskRecord } from '../../types'
import { ensureImageCached, getActiveAgentRounds, getCachedImage } from '../../store'
import { collectAgentRoundOutputImageSlots } from '../../lib/agentImageReferences'
import ViewportTooltip from '../../shared/ui/ViewportTooltip'

export type AtImageOption =
  | { type: 'input'; key: string; label: string; imageId: string; dataUrl: string; imageIndex: number }
  | { type: 'agent-output'; key: string; label: string; imageId: string; insertText: string }

export function agentImageMentionMatches(query: string, label: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  const normalizedLabel = label.toLowerCase()
  return normalizedLabel.includes(normalized) || normalizedLabel.replace(/^@/, '').includes(normalized)
}

export function getAgentOutputImageOptions(conversation: AgentConversation | null, tasks: TaskRecord[]): AtImageOption[] {
  if (!conversation) return []
  return getActiveAgentRounds(conversation).flatMap((round) =>
    collectAgentRoundOutputImageSlots(round, tasks).flatMap((imageId, imageIndex) => {
      if (!imageId) return []
      const label = `@第${round.index}轮图${imageIndex + 1}`
      return {
        type: 'agent-output' as const,
        key: `agent-output:${round.id}:${imageIndex}:${imageId}`,
        label,
        imageId,
        insertText: label,
      }
    }),
  )
}

export function ButtonTooltip({ visible, text }: { visible: boolean; text: ReactNode }) {
  if (!visible) return null

  return (
    <ViewportTooltip visible className="z-10 whitespace-nowrap">
      {text}
    </ViewportTooltip>
  )
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export function useGlobalInputImageDropPaste(input: {
  handleFilesRef: MutableRefObject<(files: FileList | File[]) => Promise<void> | void>
  addInputImage: (image: InputImage) => void
  setIsDragging: (isDragging: boolean) => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
}) {
  const dragCounter = useRef(0)

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const items = event.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) {
        event.preventDefault()
        void input.handleFilesRef.current(imageFiles)
      }
    }

    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [input.handleFilesRef])

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      dragCounter.current += 1
      if (event.dataTransfer?.types.includes('Files')) {
        input.setIsDragging(true)
      }
    }

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      dragCounter.current -= 1
      if (dragCounter.current === 0) {
        input.setIsDragging(false)
      }
    }

    const handleDrop = (event: DragEvent) => {
      event.preventDefault()
      event.stopPropagation()
      dragCounter.current = 0
      input.setIsDragging(false)
      const files = event.dataTransfer?.files
      if (files && files.length > 0) {
        void input.handleFilesRef.current(files)
        return
      }

      const transferredText = event.dataTransfer?.getData('text/plain')
      const imageIds = transferredText?.startsWith('agent-images:')
        ? transferredText.slice('agent-images:'.length).split(',')
        : transferredText?.startsWith('agent-image:')
          ? [transferredText.slice('agent-image:'.length)]
          : []

      if (imageIds.length > 0) {
        Promise.all(imageIds.map(async (imageId) => {
          const dataUrl = await ensureImageCached(imageId)
          if (!dataUrl) {
            input.showToast('部分图片已不存在', 'error')
            return
          }
          input.addInputImage({ id: imageId, dataUrl })
        })).then(() => {
          input.showToast('已上传图片', 'success')
        }).catch((err) => input.showToast(`上传图片失败：${err instanceof Error ? err.message : String(err)}`, 'error'))
      }
    }

    document.addEventListener('dragenter', handleDragEnter)
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('dragleave', handleDragLeave)
    document.addEventListener('drop', handleDrop)

    return () => {
      document.removeEventListener('dragenter', handleDragEnter)
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('dragleave', handleDragLeave)
      document.removeEventListener('drop', handleDrop)
    }
  }, [input.addInputImage, input.handleFilesRef, input.setIsDragging, input.showToast])
}

export function AtImageOptionThumb({ option }: { option: AtImageOption }) {
  const [src, setSrc] = useState(option.type === 'input' ? option.dataUrl : getCachedImage(option.imageId) || '')

  useEffect(() => {
    if (option.type === 'input') {
      setSrc(option.dataUrl)
      return
    }

    let cancelled = false
    setSrc(getCachedImage(option.imageId) || '')
    ensureImageCached(option.imageId).then((url) => {
      if (!cancelled && url) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [option])

  return (
    <span className="h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-gray-200/70 bg-gray-100 dark:border-white/[0.08] dark:bg-white/[0.04]">
      {src && <img src={src} className="h-full w-full object-cover" alt="" />}
    </span>
  )
}
