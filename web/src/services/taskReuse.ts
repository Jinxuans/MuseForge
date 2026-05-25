import type { AppSettings, InputImage, MaskDraft, TaskRecord } from '../types'
import { getActiveApiProfile, normalizeSettings } from '../lib/apiProfiles'
import { normalizeParamsForSettings } from '../lib/paramCompatibility'
import { ensureImageCached } from '../store/imageCache'
import { createSettingsForApiProfile, getTaskApiProfile, getTaskApiProfileName } from '../store/taskDomain'

export async function prepareTaskReuse(task: TaskRecord, settings: AppSettings) {
  const normalizedSettings = normalizeSettings(settings)
  const currentProfile = getActiveApiProfile(settings)
  const matchedProfile = normalizedSettings.reuseTaskApiProfileTemporarily ? getTaskApiProfile(normalizedSettings, task) : null
  const shouldTemporarilyReuseProfile = Boolean(matchedProfile && matchedProfile.id !== currentProfile.id)
  const missingReusedProfile = normalizedSettings.reuseTaskApiProfileTemporarily && !matchedProfile
  const taskProfileName = matchedProfile?.name ?? getTaskApiProfileName(task)
  const paramsSettings = shouldTemporarilyReuseProfile && matchedProfile ? createSettingsForApiProfile(normalizedSettings, matchedProfile) : normalizedSettings
  const inputImages = await readTaskInputImages(task)
  const maskDraft = await readTaskMaskDraft(task, inputImages)

  return {
    prompt: task.prompt,
    params: normalizeParamsForSettings(task.params, paramsSettings, { hasInputImages: task.inputImageIds.length > 0 }),
    inputImages,
    maskDraft,
    reusedProfileId: shouldTemporarilyReuseProfile && matchedProfile ? matchedProfile.id : null,
    missingReusedProfile,
    taskProfileName,
    currentProfileName: currentProfile.name,
    reusedProfileName: matchedProfile?.name ?? null,
    shouldTemporarilyReuseProfile,
  }
}

export async function collectTaskOutputInputImages(task: TaskRecord, existingInputImages: InputImage[]) {
  const existingIds = new Set(existingInputImages.map((img) => img.id))
  const images: InputImage[] = []
  for (const imgId of task.outputImages) {
    if (existingIds.has(imgId)) continue
    const dataUrl = await ensureImageCached(imgId)
    if (dataUrl) images.push({ id: imgId, dataUrl, sourceTaskId: task.id, sourceImageId: imgId })
  }
  return images
}

async function readTaskInputImages(task: TaskRecord) {
  const images: InputImage[] = []
  for (const imgId of task.inputImageIds) {
    const dataUrl = await ensureImageCached(imgId)
    if (dataUrl) images.push({ id: imgId, dataUrl })
  }
  return images
}

async function readTaskMaskDraft(task: TaskRecord, inputImages: InputImage[]): Promise<MaskDraft | null> {
  const maskTargetImageId = task.maskTargetImageId ?? (task.maskImageId ? task.inputImageIds[0] : null)
  if (!maskTargetImageId || !task.maskImageId || !inputImages.some((img) => img.id === maskTargetImageId)) return null

  const maskDataUrl = await ensureImageCached(task.maskImageId)
  return maskDataUrl
    ? {
        targetImageId: maskTargetImageId,
        maskDataUrl,
        updatedAt: Date.now(),
      }
    : null
}
