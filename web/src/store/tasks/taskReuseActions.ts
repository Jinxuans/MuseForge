import type { TaskRecord } from '../../types'
import { cancelQueuedBackendTask } from '../../services/backendTaskExecution'
import { createRetryTask } from '../../services/taskRetryExecution'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import { collectTaskOutputInputImages, prepareTaskReuse } from '../../services/taskReuse'
import type { AppState } from '../appState'
import { genId } from '../shared'

type TaskReuseActionState = Pick<
  AppState,
  | 'settings'
  | 'setPrompt'
  | 'setParams'
  | 'setInputImages'
  | 'setMaskDraft'
  | 'clearMaskDraft'
  | 'showToast'
  | 'setConfirmDialog'
  | 'setReusedTaskApiProfile'
  | 'inputImages'
  | 'addInputImage'
>

type TaskReuseActionsDeps = {
  createTaskExecutionContext: () => TaskExecutionContext
  executeTask: (taskId: string) => void
  getState: () => TaskReuseActionState
  submitTask: (options?: { allowFullMask?: boolean; useCurrentApiProfileWhenReusedMissing?: boolean }) => Promise<void>
}

export function createTaskReuseActions({
  createTaskExecutionContext,
  executeTask,
  getState,
  submitTask,
}: TaskReuseActionsDeps) {
  return {
    cancelQueuedServerTask(task: TaskRecord) {
      return cancelQueuedBackendTask(createTaskExecutionContext(), task)
    },

    async retryTask(task: TaskRecord) {
      const { settings } = getState()
      const taskId = genId()
      await createRetryTask(createTaskExecutionContext(), task, settings, taskId)
      executeTask(taskId)
    },

    async reuseConfig(task: TaskRecord) {
      const {
        settings,
        setPrompt,
        setParams,
        setInputImages,
        setMaskDraft,
        clearMaskDraft,
        showToast,
        setConfirmDialog,
        setReusedTaskApiProfile,
      } = getState()
      const reuse = await prepareTaskReuse(task, settings)

      setParams(reuse.params)
      setReusedTaskApiProfile(
        reuse.reusedProfileId,
        reuse.missingReusedProfile,
        reuse.taskProfileName,
      )
      clearMaskDraft()
      setInputImages(reuse.inputImages)
      setPrompt(reuse.prompt)
      if (reuse.maskDraft) setMaskDraft(reuse.maskDraft)
      else clearMaskDraft()

      if (reuse.missingReusedProfile) {
        setConfirmDialog({
          title: '找不到 API 配置',
          message: `找不到复用任务所使用的 API 配置「${reuse.taskProfileName}」，要使用当前的 API 配置「${reuse.currentProfileName}」提交任务吗？`,
          confirmText: '使用当前配置提交',
          cancelText: '放弃提交',
          action: () => {
            void submitTask({ useCurrentApiProfileWhenReusedMissing: true })
          },
        })
        return
      }

      showToast(
        reuse.shouldTemporarilyReuseProfile && reuse.reusedProfileName
          ? `已临时复用该任务的 API 配置「${reuse.reusedProfileName}」`
          : '已复用配置到输入框',
        'success',
      )
    },

    async editOutputs(task: TaskRecord) {
      const { inputImages, addInputImage, showToast } = getState()
      if (!task.outputImages?.length) return

      const images = await collectTaskOutputInputImages(task, inputImages)
      for (const image of images) addInputImage(image)
      showToast(`已添加 ${images.length} 张输出图到输入`, 'success')
    },
  }
}
