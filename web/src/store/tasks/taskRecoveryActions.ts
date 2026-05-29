import type { ApiProfile } from '../../types'
import {
  completeRecoveredCustomTask as completeRecoveredCustomTaskInService,
  completeRecoveredFalTask as completeRecoveredFalTaskInService,
} from '../../services/taskRecoveryCompletion'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import {
  scheduleCustomRecovery as scheduleCustomRecoveryInService,
  scheduleFalRecovery as scheduleFalRecoveryInService,
  scheduleOpenAIWatchdog as scheduleOpenAIWatchdogInService,
  type TaskRecoveryContext,
} from '../../services/taskRecovery'
import type { AppState } from '../appState'

type TaskRecoveryActionState = Pick<AppState, 'settings' | 'tasks' | 'showToast'>

type TaskRecoveryActionsDeps = {
  createTaskExecutionContext: () => TaskExecutionContext
  getState: () => TaskRecoveryActionState
  updateTask: TaskRecoveryContext['updateTask']
}

export function createTaskRecoveryActions({
  createTaskExecutionContext,
  getState,
  updateTask,
}: TaskRecoveryActionsDeps) {
  function createContext(): TaskRecoveryContext {
    return {
      getSettings: () => getState().settings,
      getTasks: () => getState().tasks,
      updateTask,
      completeRecoveredFalTask: (task, result) => completeRecoveredFalTaskInService(createTaskExecutionContext(), task, result),
      completeRecoveredCustomTask: (task, result) => completeRecoveredCustomTaskInService(createTaskExecutionContext(), task, result),
      showToast: (message, type = 'info') => getState().showToast(message, type),
    }
  }

  return {
    scheduleOpenAIWatchdog(taskId: string, timeoutSeconds: number, profile?: ApiProfile | null) {
      scheduleOpenAIWatchdogInService(createContext(), taskId, timeoutSeconds, profile)
    },

    scheduleFalRecovery(taskId: string, delayMs?: number) {
      scheduleFalRecoveryInService(createContext(), taskId, delayMs)
    },

    scheduleCustomRecovery(taskId: string, delayMs?: number) {
      scheduleCustomRecoveryInService(createContext(), taskId, delayMs)
    },
  }
}
