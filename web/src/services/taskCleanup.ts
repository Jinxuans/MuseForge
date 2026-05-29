import type { AgentConversation, CategoryConfig, InputImage, TaskRecord } from '../types'
import type { AgentInputDraft } from '../store/agent/agentInputDrafts'
import { scrubAgentConversationsForDeletedTasks, scrubTaskRawResponsePayloadForDeletedTasks } from '../store/agent/agentResponseOutput'
import { addAgentReferencedImageIds, addInputDraftReferencedImageIds, addTaskReferencedImageIds } from '../store/images/imageReferences'
import { deleteCachedImageAndThumbnail } from '../store/images/imageCache'
import { applyTaskCategory, getExpiredTrashTaskIds, markTasksDeleted, restoreDeletedTasks } from '../store/tasks/taskDomain'

export type TaskCleanupContext = {
  tasks: TaskRecord[]
  inputImages: InputImage[]
  galleryInputDraft: AgentInputDraft | null
  agentConversations: AgentConversation[]
  agentInputDrafts: Record<string, AgentInputDraft>
  selectedTaskIds: string[]
  setTasks: (tasks: TaskRecord[]) => void
  setAgentConversations: (conversations: AgentConversation[]) => void
  setMoveCategoryTaskIds: (updater: (ids: string[] | null) => string[] | null) => void
  setSelectedTaskIds: (ids: string[]) => void
  putTask: (task: TaskRecord) => Promise<unknown>
  deleteTask: (taskId: string) => Promise<unknown>
  deleteImage: (imageId: string) => Promise<unknown>
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
}

export async function deleteUnreferencedImageIds(ctx: Pick<TaskCleanupContext, 'tasks' | 'inputImages' | 'galleryInputDraft' | 'agentConversations' | 'agentInputDrafts' | 'deleteImage'>, imageIds: Iterable<string>) {
  const candidates = Array.from(new Set(Array.from(imageIds).filter(Boolean)))
  if (candidates.length === 0) return

  const stillUsed = collectReferencedImageIds(ctx.tasks, ctx.inputImages, ctx.galleryInputDraft, ctx.agentConversations, ctx.agentInputDrafts)
  for (const imgId of candidates) {
    if (stillUsed.has(imgId)) continue
    await ctx.deleteImage(imgId)
    deleteCachedImageAndThumbnail(imgId)
  }
}

export async function permanentlyDeleteTasks(ctx: TaskCleanupContext, taskIds: string[], options: { showToast?: boolean } = { showToast: true }) {
  if (!taskIds.length) return

  const toDelete = new Set(taskIds)
  const deletedTasks = ctx.tasks.filter((task) => toDelete.has(task.id))
  const remaining = await scrubAgentOutputPayloadsForDeletedTasks(ctx, deletedTasks, ctx.tasks.filter((task) => !toDelete.has(task.id)))

  const deletedImageIds = new Set<string>()
  for (const task of ctx.tasks) {
    if (toDelete.has(task.id)) addTaskReferencedImageIds(deletedImageIds, task)
  }

  ctx.setTasks(remaining)
  for (const id of taskIds) {
    await ctx.deleteTask(id)
  }

  const stillUsed = collectReferencedImageIds(remaining, ctx.inputImages, ctx.galleryInputDraft, ctx.agentConversations, ctx.agentInputDrafts)
  for (const imgId of deletedImageIds) {
    if (stillUsed.has(imgId)) continue
    await ctx.deleteImage(imgId)
    deleteCachedImageAndThumbnail(imgId)
  }

  ctx.setMoveCategoryTaskIds((ids) => ids?.filter((id) => !toDelete.has(id)) ?? null)

  const newSelection = ctx.selectedTaskIds.filter((id) => !toDelete.has(id))
  if (newSelection.length !== ctx.selectedTaskIds.length) {
    ctx.setSelectedTaskIds(newSelection)
  }

  if (options.showToast !== false) ctx.showToast(`已删除 ${taskIds.length} 条记录`, 'success')
}

export async function moveTasksToCategory(ctx: TaskCleanupContext, taskIds: string[], category: CategoryConfig | null) {
  const ids = new Set(taskIds)
  const updated = applyTaskCategory(ctx.tasks, taskIds, category)
  ctx.setTasks(updated)
  for (const task of updated.filter((item) => ids.has(item.id))) await ctx.putTask(task)
  ctx.setSelectedTaskIds([])
  ctx.showToast(category ? `已移动到「${category.name}」` : '已移动到未分类', 'success')
}

export async function moveTasksToTrash(ctx: TaskCleanupContext, taskIds: string[]) {
  const ids = new Set(taskIds)
  const updated = markTasksDeleted(ctx.tasks, taskIds)
  ctx.setTasks(updated)
  for (const task of updated.filter((item) => ids.has(item.id))) await ctx.putTask(task)
  ctx.setSelectedTaskIds([])
  ctx.showToast(`已移入回收站：${taskIds.length} 条`, 'success')
}

export async function restoreTasksFromTrash(ctx: TaskCleanupContext, taskIds: string[]) {
  const ids = new Set(taskIds)
  const updated = restoreDeletedTasks(ctx.tasks, taskIds)
  ctx.setTasks(updated)
  for (const task of updated.filter((item) => ids.has(item.id))) await ctx.putTask(task)
  ctx.setSelectedTaskIds([])
  ctx.showToast(`已恢复：${taskIds.length} 条`, 'success')
}

export async function emptyTrash(ctx: TaskCleanupContext) {
  const trashIds = ctx.tasks.filter((task) => task.deletedAt).map((task) => task.id)
  if (!trashIds.length) return
  await permanentlyDeleteTasks(ctx, trashIds, { showToast: false })
  ctx.showToast(`已清空回收站：${trashIds.length} 条`, 'success')
}

export async function cleanupExpiredTrashTasks(ctx: TaskCleanupContext, now = Date.now()) {
  const expiredIds = getExpiredTrashTaskIds(ctx.tasks, now)
  if (!expiredIds.length) return 0
  await permanentlyDeleteTasks(ctx, expiredIds, { showToast: false })
  return expiredIds.length
}

function collectReferencedImageIds(
  tasks: TaskRecord[],
  inputImages: InputImage[],
  galleryInputDraft: AgentInputDraft | null,
  agentConversations: AgentConversation[],
  agentInputDrafts: Record<string, AgentInputDraft>,
) {
  const stillUsed = new Set<string>()
  for (const task of tasks) addTaskReferencedImageIds(stillUsed, task)
  addAgentReferencedImageIds(stillUsed, agentConversations, agentInputDrafts)
  addInputDraftReferencedImageIds(stillUsed, galleryInputDraft)
  for (const img of inputImages) stillUsed.add(img.id)
  return stillUsed
}

async function scrubAgentOutputPayloadsForDeletedTasks(ctx: TaskCleanupContext, deletedTasks: TaskRecord[], remainingTasks: TaskRecord[]) {
  if (deletedTasks.length === 0) return remainingTasks

  const conversations = scrubAgentConversationsForDeletedTasks(ctx.agentConversations, deletedTasks)
  const scrubbedTasks = remainingTasks.map((task) => scrubTaskRawResponsePayloadForDeletedTasks(task, conversations, deletedTasks))
  ctx.setAgentConversations(conversations)

  for (const task of scrubbedTasks) {
    const previous = remainingTasks.find((item) => item.id === task.id)
    if (previous?.rawResponsePayload !== task.rawResponsePayload) await ctx.putTask(task)
  }

  return scrubbedTasks
}
