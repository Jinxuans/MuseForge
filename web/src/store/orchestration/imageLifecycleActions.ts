import type { StoredImage, TaskRecord } from '../../types'
import type { ImageReferenceState } from '../images/imageReferences'
import { createImageLifecycleActions } from '../images/imageLifecycleActions'

type StoreImageLifecycleActionsDeps = {
  cacheImage: (id: string, dataUrl: string) => void
  deleteCachedImageState: (imageId: string) => void
  deleteImage: (imageId: string) => Promise<unknown>
  deleteUnreferencedImageIds: (imageIds: Iterable<string>) => Promise<void>
  getState: () => ImageReferenceState
  isImageReferencedByState: (state: ImageReferenceState, imageId: string) => boolean
  storeImage: (dataUrl: string, type?: NonNullable<StoredImage['source']>) => Promise<string>
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
}

export function createStoreImageLifecycleActions(deps: StoreImageLifecycleActionsDeps) {
  return createImageLifecycleActions(deps)
}
