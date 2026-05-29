import type { AgentApiResultImage } from '../../lib/agentApi'
import {
  completeAgentImageTask as completeAgentImageTaskInService,
  createCompletedAgentImageTask,
  ensureStreamingAgentTask as ensureStreamingAgentTaskInService,
} from '../../services/agentTaskExecution'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import type { AgentConversation, AgentRound, ApiProfile, TaskParams, TaskRecord } from '../../types'
import { genId } from '../shared'
import { resolveAgentReferenceImages } from './agentApiInputItems'
import { attachTaskToAgentRound } from './agentRounds'
import { uniqueIds } from './agentRuntimeDomain'

type AgentRoundTaskBridgeState = {
  tasks: TaskRecord[]
  agentConversations: AgentConversation[]
}

type EnsureStreamingAgentTaskOptions = {
  createdAt?: number
  agentBatchCallId?: string
  maskTargetImageId?: string | null
  maskImageId?: string | null
}

export type EnsureAgentStreamingTask = (
  toolCallId: string,
  taskPrompt?: string,
  inputImageIds?: string[],
  options?: EnsureStreamingAgentTaskOptions,
) => Promise<string>

export function createAgentRoundTaskBridge(input: {
  createTaskExecutionContext: () => TaskExecutionContext
  getState: () => AgentRoundTaskBridgeState
  updateAgentConversation: (conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) => void
  conversationId: string
  roundId: string
  assistantMessageId: string
  round: AgentRound
  params: TaskParams
  activeProfile: ApiProfile
  completedImagePromptFallback: string
  startedAt: number
}) {
  const streamingTaskIds: string[] = []
  const taskIdByToolCallId = new Map<string, string>()

  const attachTaskToAgentRoundInStore = (taskId: string) => {
    if (streamingTaskIds.includes(taskId)) return
    streamingTaskIds.push(taskId)
    input.updateAgentConversation(input.conversationId, (current) =>
      attachTaskToAgentRound(current, input.roundId, input.assistantMessageId, taskId),
    )
  }

  const ensureStreamingAgentTask: EnsureAgentStreamingTask = async (
    toolCallId,
    taskPrompt = '',
    inputImageIds = input.round.inputImageIds ?? [],
    options = {},
  ) => {
    return ensureStreamingAgentTaskInService(input.createTaskExecutionContext(), taskIdByToolCallId, {
      taskId: genId(),
      toolCallId,
      prompt: taskPrompt,
      params: input.params,
      profile: input.activeProfile,
      inputImageIds,
      maskTargetImageId: options.maskTargetImageId !== undefined ? options.maskTargetImageId : input.round.maskTargetImageId ?? null,
      maskImageId: options.maskImageId !== undefined ? options.maskImageId : input.round.maskImageId ?? null,
      conversationId: input.conversationId,
      roundId: input.roundId,
      assistantMessageId: input.assistantMessageId,
      createdAt: options.createdAt ?? Date.now(),
      ...(options.agentBatchCallId ? { agentBatchCallId: options.agentBatchCallId } : {}),
      attachTask: attachTaskToAgentRoundInStore,
    })
  }

  const completeAgentImageTask = async (image: AgentApiResultImage, rawResponsePayload?: string) => {
    const toolCallId = image.toolCallId ?? genId()
    const taskId = await ensureStreamingAgentTask(toolCallId)
    return completeAgentImageTaskInService(input.createTaskExecutionContext(), taskId, image, rawResponsePayload, input.startedAt)
  }

  const createCompletedImageTask = async (
    image: AgentApiResultImage,
    referenceImageIds: string[],
    rawResponsePayload?: string,
  ) => {
    await createCompletedAgentImageTask(input.createTaskExecutionContext(), {
      taskId: genId(),
      image,
      prompt: image.revisedPrompt ?? input.completedImagePromptFallback,
      params: input.params,
      profile: input.activeProfile,
      inputImageIds: uniqueIds([...(input.round.inputImageIds ?? []), ...referenceImageIds]),
      maskTargetImageId: input.round.maskTargetImageId ?? null,
      maskImageId: input.round.maskImageId ?? null,
      rawResponsePayload,
      conversationId: input.conversationId,
      roundId: input.roundId,
      assistantMessageId: input.assistantMessageId,
      startedAt: input.startedAt,
      attachTask: attachTaskToAgentRoundInStore,
    })
  }

  const resolveReferenceImages = async (referenceIds: string[]) => {
    const latestConv = input.getState().agentConversations.find((item) => item.id === input.conversationId)
    if (!latestConv) return { dataUrls: [], imageIds: [] }
    return resolveAgentReferenceImages(latestConv, input.roundId, referenceIds, input.getState().tasks)
  }

  return {
    streamingTaskIds,
    taskIdByToolCallId,
    ensureStreamingAgentTask,
    completeAgentImageTask,
    createCompletedImageTask,
    resolveReferenceImages,
  }
}

export type AgentRoundTaskBridge = ReturnType<typeof createAgentRoundTaskBridge>
