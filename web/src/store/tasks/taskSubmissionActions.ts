import { getActiveApiProfile, normalizeSettings, validateApiProfile } from '../../lib/apiProfiles'
import { createSubmittedGalleryTask } from '../../services/taskSubmissionPreparation'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import type { AppState } from '../appState'
import { createSettingsForApiProfile, getReusedTaskApiProfile } from './taskDomain'
import { genId } from '../shared'

export type SubmitTaskOptions = {
  allowFullMask?: boolean
  useCurrentApiProfileWhenReusedMissing?: boolean
}

type TaskSubmissionState = Pick<
  AppState,
  | 'settings'
  | 'prompt'
  | 'inputImages'
  | 'maskDraft'
  | 'params'
  | 'reusedTaskApiProfileId'
  | 'reusedTaskApiProfileName'
  | 'reusedTaskApiProfileMissing'
  | 'activeCategoryId'
  | 'categories'
  | 'showToast'
  | 'setConfirmDialog'
  | 'setReusedTaskApiProfile'
  | 'setShowSettings'
  | 'clearMaskDraft'
  | 'setParams'
  | 'setPrompt'
  | 'clearInputImages'
>

type TaskSubmissionDeps = {
  createTaskExecutionContext: () => TaskExecutionContext
  executeTask: (taskId: string) => void
  getState: () => TaskSubmissionState
  uncategorizedCategoryId: string
}

export function createSubmitTaskAction({
  createTaskExecutionContext,
  executeTask,
  getState,
  uncategorizedCategoryId,
}: TaskSubmissionDeps) {
  const submitTask = async (options: SubmitTaskOptions = {}) => {
    const {
      settings,
      prompt,
      inputImages,
      maskDraft,
      params,
      reusedTaskApiProfileId,
      reusedTaskApiProfileName,
      reusedTaskApiProfileMissing,
      activeCategoryId,
      categories,
      showToast,
      setConfirmDialog,
    } = getState()

    const normalizedSettings = normalizeSettings(settings)
    let activeProfile = getActiveApiProfile(settings)
    let requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
    if (normalizedSettings.reuseTaskApiProfileTemporarily && (reusedTaskApiProfileId || reusedTaskApiProfileMissing)) {
      const reusedProfile = getReusedTaskApiProfile(normalizedSettings, reusedTaskApiProfileId)
      if (!reusedProfile) {
        if (options.useCurrentApiProfileWhenReusedMissing) {
          getState().setReusedTaskApiProfile(null)
        } else {
          setConfirmDialog({
            title: '找不到 API 配置',
            message: `找不到复用任务所使用的 API 配置「${reusedTaskApiProfileName || '未知配置'}」，要使用当前的 API 配置「${activeProfile.name}」提交任务吗？`,
            confirmText: '使用当前配置提交',
            cancelText: '放弃提交',
            action: () => {
              void submitTask({ ...options, useCurrentApiProfileWhenReusedMissing: true })
            },
          })
          return
        }
      } else {
        activeProfile = reusedProfile
        requestSettings = createSettingsForApiProfile(normalizedSettings, reusedProfile)
      }
    }

    const validationError = validateApiProfile(activeProfile)
    if (validationError) {
      showToast(`请先完善请求 API 配置：${validationError}`, 'error')
      getState().setShowSettings(true)
      return
    }

    if (!prompt.trim()) {
      showToast('请输入提示词', 'error')
      return
    }

    const taskId = genId()
    const prepared = await createSubmittedGalleryTask(createTaskExecutionContext(), {
      taskId,
      prompt,
      params,
      inputImages,
      maskDraft,
      activeProfile,
      requestSettings,
      categories,
      activeCategoryId,
      uncategorizedCategoryId,
      allowFullMask: options.allowFullMask,
    })

    if (prepared.status === 'full-mask') {
      setConfirmDialog({
        title: '确认编辑整张图片？',
        message: '当前遮罩覆盖了整张图片，提交后可能会重绘全部内容。是否继续？',
        confirmText: '继续提交',
        tone: 'warning',
        action: () => {
          void submitTask({ allowFullMask: true })
        },
      })
      return
    }

    if (prepared.status === 'error') {
      if (prepared.clearMaskDraft) getState().clearMaskDraft()
      showToast(prepared.message, 'error')
      return
    }

    if (Object.keys(prepared.normalizedParamPatch).length) {
      getState().setParams(prepared.normalizedParamPatch)
    }
    getState().showToast('任务已提交', 'success')

    if (settings.clearInputAfterSubmit) {
      getState().setPrompt('')
      getState().clearInputImages()
    }
    getState().setReusedTaskApiProfile(null)

    executeTask(taskId)
  }

  return submitTask
}
