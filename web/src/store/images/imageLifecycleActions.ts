import type { StoredImage, TaskRecord } from '../../types'
import type { ImageReferenceState } from './imageReferences'

type ImageLifecycleActionsDeps = {
  cacheImage: (id: string, dataUrl: string) => void
  deleteCachedImageState: (imageId: string) => void
  deleteImage: (imageId: string) => Promise<unknown>
  deleteUnreferencedImageIds: (imageIds: Iterable<string>) => Promise<void>
  getState: () => ImageReferenceState
  isImageReferencedByState: (state: ImageReferenceState, imageId: string) => boolean
  storeImage: (dataUrl: string, type?: NonNullable<StoredImage['source']>) => Promise<string>
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
}

export function createImageLifecycleActions({
  cacheImage,
  deleteCachedImageState,
  deleteImage,
  deleteUnreferencedImageIds,
  getState,
  isImageReferencedByState,
  storeImage,
  updateTask,
}: ImageLifecycleActionsDeps) {
  return {
    async deleteImageIfUnreferenced(imageId: string) {
      deleteCachedImageState(imageId)
      if (isImageReferencedByState(getState(), imageId)) return
      try {
        await deleteImage(imageId)
      } catch {
        // 清理是内存/存储优化，失败不影响替换结果。
      }
    },

    async persistTaskStreamPartialImage(taskId: string, dataUrl: string) {
      try {
        const imgId = await storeImage(dataUrl, 'generated')
        cacheImage(imgId, dataUrl)

        const latestTask = getState().tasks.find((task) => task.id === taskId)
        if (!latestTask || latestTask.status === 'done') {
          await deleteUnreferencedImageIds([imgId])
          return
        }

        const currentIds = latestTask.streamPartialImageIds || []
        if (currentIds.includes(imgId)) return
        updateTask(taskId, { streamPartialImageIds: [...currentIds, imgId] })
      } catch (err) {
        console.error(err)
      }
    },
  }
}
