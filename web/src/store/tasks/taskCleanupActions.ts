import type { TaskRecord } from '../../types'
import {
  cleanupExpiredTrashTasks as cleanupExpiredTrashTasksInService,
  emptyTrash as emptyTrashInService,
  moveTasksToCategory as moveTasksToCategoryInService,
  moveTasksToTrash as moveTasksToTrashInService,
  permanentlyDeleteTasks as permanentlyDeleteTasksInService,
  restoreTasksFromTrash as restoreTasksFromTrashInService,
  type TaskCleanupContext,
} from '../../services/taskCleanup'
import type { AppState } from '../appState'

type TaskCleanupActionState = Pick<AppState, 'categories' | 'showToast'>

type TaskCleanupActionsDeps = {
  createContext: () => TaskCleanupContext
  getState: () => TaskCleanupActionState
}

export function createTaskCleanupActions({ createContext, getState }: TaskCleanupActionsDeps) {
  async function permanentlyDeleteTasks(taskIds: string[], options: { showToast?: boolean } = { showToast: true }) {
    await permanentlyDeleteTasksInService(createContext(), taskIds, options)
  }

  return {
    moveTasksToCategory(taskIds: string[], categoryId: string | null) {
      const { categories } = getState()
      const category = categoryId ? categories.find((item) => item.id === categoryId) ?? null : null
      void moveTasksToCategoryInService(createContext(), taskIds, category)
    },

    moveTasksToTrash(taskIds: string[]) {
      void moveTasksToTrashInService(createContext(), taskIds)
    },

    restoreTasksFromTrash(taskIds: string[]) {
      void restoreTasksFromTrashInService(createContext(), taskIds)
    },

    async removeMultipleTasks(taskIds: string[]) {
      await permanentlyDeleteTasks(taskIds, { showToast: true })
    },

    async removeTask(task: TaskRecord) {
      await permanentlyDeleteTasks([task.id], { showToast: false })
      getState().showToast('记录已删除', 'success')
    },

    async emptyTrash() {
      await emptyTrashInService(createContext())
    },

    cleanupExpiredTrashTasks(now = Date.now()) {
      return cleanupExpiredTrashTasksInService(createContext(), now)
    },
  }
}
