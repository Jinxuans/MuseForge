import { getBackendTask, type CreativeTaskDTO } from '../lib/backendTasks'
import { mapServerTaskStatus } from '../lib/backendTaskStatus'

export const BACKEND_TASK_POLL_INTERVAL_MS = 1500

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function isBackendTaskRunning(task: CreativeTaskDTO) {
  return mapServerTaskStatus(task.status) === 'running'
}

export function isBackendTaskDone(task: CreativeTaskDTO) {
  return mapServerTaskStatus(task.status) === 'done'
}

export async function waitForBackendTaskCompletion(
  taskId: string,
  options: {
    initialTask?: CreativeTaskDTO
    onPoll?: (task: CreativeTaskDTO) => void | Promise<void>
    pollIntervalMs?: number
  } = {},
) {
  let latest = options.initialTask ?? await getBackendTask(taskId)
  const pollIntervalMs = options.pollIntervalMs ?? BACKEND_TASK_POLL_INTERVAL_MS

  while (isBackendTaskRunning(latest)) {
    await delay(pollIntervalMs)
    latest = await getBackendTask(taskId)
    await options.onPoll?.(latest)
  }

  return latest
}
