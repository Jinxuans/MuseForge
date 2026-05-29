import { useCallback, useEffect, useState } from 'react'

import { createMaskPreviewDataUrl } from '../../lib/canvasImage'
import { formatImageRatio } from '../../lib/size'
import { ensureImageCached, getCachedImage } from '../../store'
import type { TaskRecord } from '../../types'

type ImageSrcMap = Record<string, string>

function getInputAndMaskImageIds(task: TaskRecord) {
  return [...new Set([
    ...(task.inputImageIds || []),
    ...(task.maskImageId ? [task.maskImageId] : []),
  ])]
}

export function useDetailImages(task: TaskRecord | null, imageIndex: number) {
  const [imageSrcs, setImageSrcs] = useState<ImageSrcMap>({})
  const [outputPreviewSrcs, setOutputPreviewSrcs] = useState<ImageSrcMap>({})
  const [imageRatios, setImageRatios] = useState<ImageSrcMap>({})
  const [imageSizes, setImageSizes] = useState<ImageSrcMap>({})
  const [maskPreviewSrc, setMaskPreviewSrc] = useState('')

  useEffect(() => {
    if (!task) {
      setImageSrcs({})
      setOutputPreviewSrcs({})
      setImageRatios({})
      setImageSizes({})
      return
    }

    let cancelled = false
    const ids = getInputAndMaskImageIds(task)
    const initial: ImageSrcMap = {}
    for (const id of ids) {
      const cached = getCachedImage(id)
      if (cached) initial[id] = cached
    }
    setImageSrcs(initial)
    for (const id of ids) {
      if (initial[id]) continue
      ensureImageCached(id).then((url) => {
        if (!cancelled && url) setImageSrcs((prev) => ({ ...prev, [id]: url }))
      })
    }

    return () => {
      cancelled = true
    }
  }, [task])

  useEffect(() => {
    const outputImageIds = task?.outputImages ?? []
    if (outputImageIds.length === 0) {
      setOutputPreviewSrcs({})
      return
    }

    let cancelled = false
    const setOutputImage = (imageId: string, dataUrl: string) => {
      if (!cancelled) setOutputPreviewSrcs((prev) => ({ ...prev, [imageId]: dataUrl }))
    }

    for (const imageId of outputImageIds) {
      const cached = getCachedImage(imageId)
      if (cached) {
        setOutputImage(imageId, cached)
      } else {
        ensureImageCached(imageId)
          .then((dataUrl) => {
            if (dataUrl) setOutputImage(imageId, dataUrl)
          })
          .catch(() => {})
      }
    }

    return () => {
      cancelled = true
    }
  }, [task?.outputImages])

  const currentOutputImageId = task?.outputImages?.[imageIndex] || ''
  const currentOutputPreviewSrc = currentOutputImageId ? outputPreviewSrcs[currentOutputImageId] || '' : ''
  const maskTargetId = task?.maskTargetImageId || null
  const maskTargetSrc = maskTargetId ? imageSrcs[maskTargetId] || '' : ''
  const maskSrc = task?.maskImageId ? imageSrcs[task.maskImageId] || '' : ''
  const allInputImageIds = task?.inputImageIds ?? []

  useEffect(() => {
    let cancelled = false
    setMaskPreviewSrc('')
    if (!maskTargetSrc || !maskSrc) return

    createMaskPreviewDataUrl(maskTargetSrc, maskSrc)
      .then((url) => {
        if (!cancelled) setMaskPreviewSrc(url)
      })
      .catch(() => {
        if (!cancelled) setMaskPreviewSrc('')
      })

    return () => {
      cancelled = true
    }
  }, [maskTargetSrc, maskSrc])

  const recordOutputImageMetadata = useCallback((imageId: string, image: HTMLImageElement) => {
    if (!imageId || image.naturalWidth <= 0 || image.naturalHeight <= 0) return

    setImageRatios((prev) => ({
      ...prev,
      [imageId]: formatImageRatio(image.naturalWidth, image.naturalHeight),
    }))
    setImageSizes((prev) => ({
      ...prev,
      [imageId]: `${image.naturalWidth}×${image.naturalHeight}`,
    }))
  }, [])

  return {
    allInputImageIds,
    currentImageRatio: currentOutputImageId ? imageRatios[currentOutputImageId] : '',
    currentImageSize: currentOutputImageId ? imageSizes[currentOutputImageId] : '',
    currentOutputImageId,
    currentOutputPreviewSrc,
    imageSrcs,
    maskPreviewSrc,
    maskTargetId,
    recordOutputImageMetadata,
  }
}
