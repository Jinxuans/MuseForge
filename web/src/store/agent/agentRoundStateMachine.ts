import { callAgentResponsesApi } from '../../lib/agentApi'
import { executeBatchImageFunctionCall } from '../../services/agentRuntime'
import type { AgentConversation, ApiProfile, AppSettings, ResponsesOutputItem, TaskParams, TaskRecord } from '../../types'
import { DEFAULT_AGENT_MAX_TOOL_ROUNDS } from '../../types'
import { genId } from '../shared'
import { createAgentContinuationTurnInput } from './agentContinuationInput'
import {
  ensureStreamingAssistantMessage,
  setAgentRoundResponseOutput,
} from './agentRounds'
import { mergeResponseOutputItems } from './agentResponseOutput'
import { createAgentResponseStreamCallbacks } from './agentResponseStreamCallbacks'
import {
  createAgentResponseTextAccumulator,
  markAgentResponsePendingToolTextSeparator,
} from './agentResponseTextAccumulator'
import { processAgentResponseTurn } from './agentResponseTurnProcessing'
import { createAgentAbortError } from './agentRuntimeDomain'
import type { AgentRoundTaskBridge } from './agentRoundTaskBridge'

type AgentRoundStateMachineState = {
  tasks: TaskRecord[]
  agentConversations: AgentConversation[]
  setTaskStreamPreview: (taskId: string, image?: string, requestIndex?: number) => void
}

export async function runAgentRoundStateMachine(input: {
  conversationId: string
  roundId: string
  assistantMessageId: string
  params: TaskParams
  requestSettings: AppSettings
  activeProfile: ApiProfile
  apiInput: unknown[]
  maskDataUrl?: string
  signal: AbortSignal
  taskBridge: AgentRoundTaskBridge
  getState: () => AgentRoundStateMachineState
  updateAgentConversation: (conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) => void
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
  persistTaskStreamPartialImage: (taskId: string, dataUrl: string) => Promise<unknown> | unknown
  appendAssistantMessageContent: (delta: string) => void
}) {
  const shouldStreamAssistantMessage = input.activeProfile.streamImages === true

  if (shouldStreamAssistantMessage) {
    input.updateAgentConversation(input.conversationId, (current) =>
      ensureStreamingAssistantMessage(current, input.roundId, input.assistantMessageId),
    )
  }

  const maxToolCalls = Number.isFinite(input.requestSettings.agentMaxToolRounds)
    ? Math.max(1, Math.trunc(input.requestSettings.agentMaxToolRounds))
    : DEFAULT_AGENT_MAX_TOOL_ROUNDS
  let apiInputForTurn = input.apiInput
  let accumulatedOutputItems: ResponsesOutputItem[] = []
  const responseTextState = createAgentResponseTextAccumulator()
  let lastResponseId: string | undefined
  let toolCallsUsed = 0
  let reachedToolLimit = false

  while (true) {
    if (input.signal.aborted) throw createAgentAbortError()
    const textBeforeResponse = responseTextState.accumulatedText
    const streamCallbacks = createAgentResponseStreamCallbacks({
      enabled: shouldStreamAssistantMessage,
      signal: input.signal,
      textState: responseTextState,
      appendVisibleText: input.appendAssistantMessageContent,
      onOutputItems: (outputItems) => {
        input.updateAgentConversation(input.conversationId, (current) =>
          setAgentRoundResponseOutput(
            current,
            input.roundId,
            mergeResponseOutputItems(accumulatedOutputItems, outputItems),
          ),
        )
      },
      ensureStreamingAgentTask: input.taskBridge.ensureStreamingAgentTask,
      setTaskStreamPreview: (taskId, image, requestIndex) =>
        input.getState().setTaskStreamPreview(taskId, image, requestIndex),
      persistTaskStreamPartialImage: input.persistTaskStreamPartialImage,
      completeAgentImageTask: input.taskBridge.completeAgentImageTask,
    })
    const result = await callAgentResponsesApi({
      settings: input.requestSettings,
      profile: input.activeProfile,
      params: input.params,
      input: apiInputForTurn,
      maskDataUrl: input.maskDataUrl,
      signal: input.signal,
      ...streamCallbacks.callbacks,
    })
    if (input.signal.aborted) throw createAgentAbortError()

    lastResponseId = result.responseId ?? lastResponseId
    const turnResult = await processAgentResponseTurn({
      result,
      streamedOutputItems: streamCallbacks.state.currentResponseOutputItems,
      accumulatedOutputItems,
      textState: responseTextState,
      textBeforeResponse,
      shouldStreamAssistantMessage,
      appendVisibleText: input.appendAssistantMessageContent,
      taskIdByToolCallId: input.taskBridge.taskIdByToolCallId,
      streamingTaskIds: input.taskBridge.streamingTaskIds,
      completeExistingImageTask: input.taskBridge.completeAgentImageTask,
      createCompletedImageTask: input.taskBridge.createCompletedImageTask,
      resolveReferenceImages: input.taskBridge.resolveReferenceImages,
      getTask: (taskId) => input.getState().tasks.find((task) => task.id === taskId),
      updateTask: input.updateTask,
      executeBatchFunctionCall: async (functionCallItem) => {
        const { output, successCount } = await executeBatchImageFunctionCall({
          profile: input.activeProfile,
          params: input.params,
          signal: input.signal,
          shouldStreamAssistantMessage,
          genId,
          resolveReferenceImages: input.taskBridge.resolveReferenceImages,
          ensureStreamingAgentTask: input.taskBridge.ensureStreamingAgentTask,
          completeAgentImageTask: input.taskBridge.completeAgentImageTask,
          getTaskIdByToolCallId: (toolCallId) => input.taskBridge.taskIdByToolCallId.get(toolCallId),
          setTaskStreamPreview: (taskId, image, requestIndex) =>
            input.getState().setTaskStreamPreview(taskId, image, requestIndex),
          persistTaskStreamPartialImage: input.persistTaskStreamPartialImage,
        }, functionCallItem)
        return { output, successCount }
      },
    })

    accumulatedOutputItems = turnResult.accumulatedOutputItems
    toolCallsUsed += turnResult.toolCallCountIncrement

    if (turnResult.functionCallOutputs.length === 0) {
      input.updateAgentConversation(input.conversationId, (current) =>
        setAgentRoundResponseOutput(current, input.roundId, accumulatedOutputItems, lastResponseId),
      )
      break
    }

    const accumulatedOutputItemsWithFunctionOutputs = mergeResponseOutputItems(
      accumulatedOutputItems,
      turnResult.functionCallOutputs,
    )

    input.updateAgentConversation(input.conversationId, (current) =>
      setAgentRoundResponseOutput(
        current,
        input.roundId,
        accumulatedOutputItemsWithFunctionOutputs,
        lastResponseId,
      ),
    )

    if (toolCallsUsed >= maxToolCalls) {
      reachedToolLimit = true
      break
    }

    const latestConversation = input.getState().agentConversations.find((item) => item.id === input.conversationId)
    const latestRound = latestConversation?.rounds.find((item) => item.id === input.roundId)
    if (!latestRound) break

    apiInputForTurn = await createAgentContinuationTurnInput({
      baseInput: input.apiInput,
      round: latestRound,
      tasks: input.getState().tasks,
      accumulatedOutputItems,
      functionCallOutputs: turnResult.functionCallOutputs,
      streamingTaskIds: input.taskBridge.streamingTaskIds,
      toolCallsUsed,
      maxToolCalls,
    })
    accumulatedOutputItems = accumulatedOutputItemsWithFunctionOutputs
    markAgentResponsePendingToolTextSeparator(responseTextState)
  }

  return {
    accumulatedOutputItems,
    lastResponseId,
    maxToolCalls,
    reachedToolLimit,
    textSegments: responseTextState.textSegments,
  }
}
