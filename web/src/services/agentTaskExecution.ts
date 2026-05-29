import type { AgentApiResultImage } from '../lib/agentApi'
import type { ApiProfile, TaskParams, TaskRecord } from '../types'
import type { TaskExecutionContext } from './taskExecutionContext'

export async function ensureStreamingAgentTask(
  ctx: TaskExecutionContext,
  taskIdByToolCallId: Map<string, string>,
  input: {
    taskId: string
    toolCallId: string
    prompt: string
    params: TaskParams
    profile: ApiProfile
    inputImageIds: string[]
    maskTargetImageId: string | null
    maskImageId: string | null
    conversationId: string
    roundId: string
    assistantMessageId: string
    createdAt: number
    agentBatchCallId?: string
    attachTask: (taskId: string) => void
  },
) {
  const existingTaskId = taskIdByToolCallId.get(input.toolCallId)
  if (existingTaskId) return existingTaskId

  const existingTask = ctx.getTaskByToolCallId(input.toolCallId)
  if (existingTask) {
    taskIdByToolCallId.set(input.toolCallId, existingTask.id)
    input.attachTask(existingTask.id)
    return existingTask.id
  }

  const task: TaskRecord = {
    id: input.taskId,
    prompt: input.prompt,
    params: { ...input.params, n: 1 },
    apiProvider: input.profile.provider,
    apiProfileId: input.profile.id,
    apiProfileName: input.profile.name,
    apiMode: input.profile.apiMode,
    apiModel: input.profile.model,
    inputImageIds: input.inputImageIds,
    maskTargetImageId: input.maskTargetImageId,
    maskImageId: input.maskImageId,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: input.createdAt,
    finishedAt: null,
    elapsed: null,
    sourceMode: 'agent',
    agentConversationId: input.conversationId,
    agentRoundId: input.roundId,
    agentMessageId: input.assistantMessageId,
    agentToolCallId: input.toolCallId,
    ...(input.agentBatchCallId ? { agentBatchCallId: input.agentBatchCallId } : {}),
  }

  taskIdByToolCallId.set(input.toolCallId, task.id)
  ctx.prependTask(task)
  input.attachTask(task.id)
  await ctx.putTask(task)
  return task.id
}

export async function completeAgentImageTask(
  ctx: TaskExecutionContext,
  taskId: string,
  image: AgentApiResultImage,
  rawResponsePayload: string | undefined,
  startedAt: number,
) {
  const latestTask = ctx.getTask(taskId)
  if (latestTask?.status === 'done' && latestTask.outputImages.length > 0) return taskId

  const imgId = await ctx.storeGeneratedImage(image.dataUrl)
  const actualParams: Partial<TaskParams> = {
    ...(Object.keys(image.actualParams ?? {}).length ? image.actualParams : {}),
    n: 1,
  }
  ctx.updateTask(taskId, {
    prompt: image.revisedPrompt ?? latestTask?.prompt ?? '',
    outputImages: [imgId],
    actualParams,
    actualParamsByImage: { [imgId]: actualParams },
    revisedPromptByImage: image.revisedPrompt ? { [imgId]: image.revisedPrompt } : undefined,
    rawResponsePayload,
    status: 'done',
    error: null,
    finishedAt: Date.now(),
    elapsed: Date.now() - (latestTask?.createdAt ?? startedAt),
    agentToolAction: image.action,
  })
  ctx.setTaskStreamPreview(taskId)
  return taskId
}

export async function createCompletedAgentImageTask(
  ctx: TaskExecutionContext,
  input: {
    taskId: string
    image: AgentApiResultImage
    prompt: string
    params: TaskParams
    profile: ApiProfile
    inputImageIds: string[]
    maskTargetImageId: string | null
    maskImageId: string | null
    conversationId: string
    roundId: string
    assistantMessageId: string
    rawResponsePayload?: string
    startedAt: number
    attachTask: (taskId: string) => void
  },
) {
  const imgId = await ctx.storeGeneratedImage(input.image.dataUrl)
  const actualParams: Partial<TaskParams> = {
    ...(Object.keys(input.image.actualParams ?? {}).length ? input.image.actualParams : {}),
    n: 1,
  }
  const task: TaskRecord = {
    id: input.taskId,
    prompt: input.prompt,
    params: input.params,
    apiProvider: input.profile.provider,
    apiProfileId: input.profile.id,
    apiProfileName: input.profile.name,
    apiMode: input.profile.apiMode,
    apiModel: input.profile.model,
    inputImageIds: input.inputImageIds,
    maskTargetImageId: input.maskTargetImageId,
    maskImageId: input.maskImageId,
    outputImages: [imgId],
    actualParams,
    actualParamsByImage: { [imgId]: actualParams },
    revisedPromptByImage: input.image.revisedPrompt ? { [imgId]: input.image.revisedPrompt } : undefined,
    rawResponsePayload: input.rawResponsePayload,
    status: 'done',
    error: null,
    createdAt: input.startedAt,
    finishedAt: Date.now(),
    elapsed: Date.now() - input.startedAt,
    sourceMode: 'agent',
    agentConversationId: input.conversationId,
    agentRoundId: input.roundId,
    agentMessageId: input.assistantMessageId,
    agentToolCallId: input.image.toolCallId,
    agentToolAction: input.image.action,
  }

  ctx.prependTask(task)
  input.attachTask(task.id)
  await ctx.putTask(task)
  return task.id
}
