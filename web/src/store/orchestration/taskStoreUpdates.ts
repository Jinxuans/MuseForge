import type { TaskRecord } from '../../types'
import type { AppState } from '../appState'
import {
  getExistingLocalDataSupportPromptPatch,
  getImportedDataSupportPromptPatch,
  shouldOpenSupportPromptForTaskUpdate,
  updateTaskListItem,
} from '../tasks/taskDomain'

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void
type TaskStoreUpdateState = Pick<
  AppState,
  | 'tasks'
  | 'setTasks'
  | 'supportPromptDismissed'
  | 'supportPromptOpen'
  | 'supportPromptSkippedForImportedData'
>

type TaskStoreUpdatesDeps = {
  getState: () => TaskStoreUpdateState
  putTask: (task: TaskRecord) => Promise<unknown>
  setState: StoreSetState
}

export function createTaskStoreUpdates({ getState, putTask, setState }: TaskStoreUpdatesDeps) {
  function skipSupportPromptForImportedData(tasks: TaskRecord[]) {
    setState((state) => getImportedDataSupportPromptPatch(tasks, state))
  }

  function showSupportPromptForExistingLocalData(tasks: TaskRecord[]) {
    setState((state) => getExistingLocalDataSupportPromptPatch(tasks, state))
  }

  function maybeOpenSupportPrompt(previousTasks: TaskRecord[], nextTasks: TaskRecord[], taskId: string) {
    const state = getState()
    if (shouldOpenSupportPromptForTaskUpdate(previousTasks, nextTasks, taskId, state)) {
      setState({ supportPromptOpen: true })
    }
  }

  function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>) {
    const { tasks, setTasks } = getState()
    const updated = updateTaskListItem(tasks, taskId, patch)
    setTasks(updated)
    maybeOpenSupportPrompt(tasks, updated, taskId)
    const task = updated.find((item) => item.id === taskId)
    if (task) putTask(task)
  }

  return {
    showSupportPromptForExistingLocalData,
    skipSupportPromptForImportedData,
    updateTaskInStore,
  }
}
