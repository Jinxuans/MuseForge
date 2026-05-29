import type { TaskRecord } from '../types'

export type ServerTaskStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | string

export const SERVER_TASK_STATUS_CANCELED = 'canceled'
export const SERVER_TASK_CANCELED_MESSAGE = '任务已取消。'

type ServerTaskErrorSource = {
  status: ServerTaskStatus
  error?: string | null
  last_error?: string | null
  lastError?: string | null
}

export function mapServerTaskStatus(status: ServerTaskStatus): TaskRecord['status'] {
  if (status === 'succeeded') return 'done'
  if (status === 'failed' || status === SERVER_TASK_STATUS_CANCELED) return 'error'
  return 'running'
}

export function canCancelQueuedServerTask(task: Pick<TaskRecord, 'serverTaskId' | 'status' | 'serverTaskStatus'>) {
  return Boolean(task.serverTaskId && task.status === 'running' && task.serverTaskStatus === 'queued')
}

export function getServerTaskLastError(task: ServerTaskErrorSource) {
  return task.lastError ?? task.last_error ?? null
}

export function getServerTaskErrorMessage(task: ServerTaskErrorSource) {
  if (task.status === SERVER_TASK_STATUS_CANCELED) return SERVER_TASK_CANCELED_MESSAGE
  return task.error ?? getServerTaskLastError(task)
}
