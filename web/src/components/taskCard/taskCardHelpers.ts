import type { TaskRecord } from '../../types'

export function formatTaskDuration(task: TaskRecord, now: number) {
  let seconds: number
  if (task.status === 'running' || task.falRecoverable || task.customRecoverable) {
    seconds = Math.floor((now - task.createdAt) / 1000)
  } else if (task.elapsed != null) {
    seconds = Math.floor(task.elapsed / 1000)
  } else {
    return '00:00'
  }
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
