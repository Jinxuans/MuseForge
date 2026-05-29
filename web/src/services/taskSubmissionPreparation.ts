import type { ApiProfile, AppSettings, CategoryConfig, InputImage, MaskDraft, TaskParams, TaskRecord } from '../types'
import { validateMaskMatchesImage } from '../lib/canvasImage'
import { storeImage } from '../lib/db'
import { orderInputImagesForMask } from '../lib/mask'
import { getChangedParams, normalizeParamsForSettings } from '../lib/paramCompatibility'
import { cacheImage } from '../store/images/imageCache'
import { resolveTaskParentFromInputImages } from '../store/tasks/taskDomain'
import type { TaskExecutionContext } from './taskExecutionContext'

export type SubmitTaskPreparationResult =
  | { status: 'ready'; normalizedParamPatch: Partial<TaskParams> }
  | { status: 'full-mask' }
  | { status: 'error'; message: string; clearMaskDraft: boolean }

export type PersistedTaskInputImagesResult =
  | { status: 'ready'; orderedInputImages: InputImage[]; maskImageId: string | null; maskTargetImageId: string | null }
  | { status: 'full-mask' }
  | { status: 'error'; message: string; clearMaskDraft: boolean }

export async function persistTaskInputImages(inputImages: InputImage[], maskDraft: MaskDraft | null, options: { allowFullMask?: boolean } = {}): Promise<PersistedTaskInputImagesResult> {
  let orderedInputImages = inputImages
  let maskImageId: string | null = null
  let maskTargetImageId: string | null = null

  if (maskDraft) {
    try {
      orderedInputImages = orderInputImagesForMask(inputImages, maskDraft.targetImageId)
      const coverage = await validateMaskMatchesImage(maskDraft.maskDataUrl, orderedInputImages[0].dataUrl)
      if (coverage === 'full' && !options.allowFullMask) {
        return { status: 'full-mask' }
      }
      maskImageId = await storeImage(maskDraft.maskDataUrl, 'mask')
      cacheImage(maskImageId, maskDraft.maskDataUrl)
      maskTargetImageId = maskDraft.targetImageId
    } catch (err) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        clearMaskDraft: !inputImages.some((img) => img.id === maskDraft.targetImageId),
      }
    }
  }

  for (const img of orderedInputImages) {
    await storeImage(img.dataUrl)
  }

  return { status: 'ready', orderedInputImages, maskImageId, maskTargetImageId }
}

export async function createSubmittedGalleryTask(
  ctx: TaskExecutionContext,
  input: {
    taskId: string
    prompt: string
    params: TaskParams
    inputImages: InputImage[]
    maskDraft: MaskDraft | null
    activeProfile: ApiProfile
    requestSettings: AppSettings
    categories: CategoryConfig[]
    activeCategoryId: string
    uncategorizedCategoryId: string
    allowFullMask?: boolean
  },
): Promise<SubmitTaskPreparationResult> {
  const persistedInputs = await persistTaskInputImages(input.inputImages, input.maskDraft, { allowFullMask: input.allowFullMask })
  if (persistedInputs.status !== 'ready') return persistedInputs

  const { orderedInputImages, maskImageId, maskTargetImageId } = persistedInputs
  const normalizedParams = normalizeParamsForSettings(input.params, input.requestSettings, { hasInputImages: orderedInputImages.length > 0 })
  const selectedCategory = input.activeCategoryId !== 'all' && input.activeCategoryId !== input.uncategorizedCategoryId
    ? input.categories.find((category) => category.id === input.activeCategoryId)
    : null
  const lineage = resolveTaskParentFromInputImages(orderedInputImages)
  const task: TaskRecord = {
    id: input.taskId,
    categoryId: selectedCategory?.id ?? null,
    categoryName: selectedCategory?.name ?? null,
    deletedAt: null,
    parentTaskId: lineage.parentTaskId,
    parentImageId: lineage.parentImageId,
    prompt: input.prompt.trim(),
    params: normalizedParams,
    apiProvider: input.activeProfile.provider,
    apiProfileId: input.activeProfile.id,
    apiProfileName: input.activeProfile.name,
    apiMode: input.activeProfile.apiMode,
    apiModel: input.activeProfile.model,
    inputImageIds: orderedInputImages.map((image) => image.id),
    maskTargetImageId,
    maskImageId,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  ctx.prependTask(task)
  await ctx.putTask(task)
  return {
    status: 'ready',
    normalizedParamPatch: getChangedParams(input.params, normalizedParams),
  }
}
