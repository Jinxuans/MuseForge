import type { TaskRecord } from '../../types'

const MAX_LINEAGE_DEPTH = 12

export function getTaskTitle(task: TaskRecord) {
  return task.prompt?.trim() || task.id
}

export function getStatusLabel(status: TaskRecord['status']) {
  if (status === 'done') return '完成'
  if (status === 'running') return '运行中'
  return '失败'
}

export function redactRawResponsePayload(payload: string) {
  return payload.replace(/"(b64_json|base64|data)":\s*"[^"]+"/g, '"$1": "<base64_data>"')
}

export function formatTaskTime(ts: number | null) {
  if (!ts) return ''
  return new Date(ts).toLocaleString('zh-CN')
}

export function formatTaskDuration(task: TaskRecord, now: number, reconnecting = false) {
  if (task.status === 'running' || reconnecting) {
    return formatDurationSeconds(Math.max(0, Math.floor((now - task.createdAt) / 1000)))
  }
  if (task.elapsed == null) return null
  return formatDurationSeconds(Math.floor(task.elapsed / 1000))
}

export function buildTaskDebugSnapshot(task: TaskRecord, input: {
  providerName: string
  profileName: string
  model: string
}) {
  const snapshot = {
    taskId: task.id,
    status: task.status,
    error: task.error || '生成失败',
    createdAt: new Date(task.createdAt).toISOString(),
    finishedAt: task.finishedAt ? new Date(task.finishedAt).toISOString() : null,
    elapsed: task.elapsed,
    provider: input.providerName,
    profile: input.profileName,
    apiMode: task.apiMode ?? null,
    model: input.model,
    prompt: task.prompt,
    params: task.params,
    inputImageCount: task.inputImageIds.length,
    outputImageCount: task.outputImages.length,
    rawImageUrls: task.rawImageUrls ?? [],
    rawResponsePayload: task.rawResponsePayload ?? null,
    errorDebug: task.errorDebug ?? null,
  }
  return JSON.stringify(snapshot, null, 2)
}

export function buildAncestorChain(task: TaskRecord, tasks: TaskRecord[]) {
  const byId = new Map(tasks.map((item) => [item.id, item]))
  const ancestors: TaskRecord[] = []
  const visited = new Set([task.id])
  let cursorId = task.parentTaskId || null
  let parentMissing = Boolean(cursorId)

  for (let depth = 0; cursorId && depth < MAX_LINEAGE_DEPTH; depth += 1) {
    if (visited.has(cursorId)) {
      parentMissing = false
      break
    }
    const parent = byId.get(cursorId)
    if (!parent) {
      parentMissing = true
      break
    }
    ancestors.unshift(parent)
    visited.add(parent.id)
    cursorId = parent.parentTaskId || null
    parentMissing = Boolean(cursorId)
  }

  if (!cursorId) parentMissing = false
  return { ancestors, parentMissing }
}

export function getChildTasks(task: TaskRecord, tasks: TaskRecord[]) {
  return tasks
    .filter((item) => item.parentTaskId === task.id)
    .sort((a, b) => b.createdAt - a.createdAt)
}

function formatDurationSeconds(seconds: number) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return `${mm}:${ss}`
}
