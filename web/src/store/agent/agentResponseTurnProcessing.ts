import type { AgentApiResult, AgentApiResultImage } from '../../lib/agentApi'
import type { ResponsesOutputItem, TaskRecord } from '../../types'
import { completeAgentResponseImages } from './agentImageResultCompletion'
import { mergeResponseOutputItems } from './agentResponseOutput'
import {
  appendAgentResponseTextResult,
  type AgentResponseTextAccumulator,
} from './agentResponseTextAccumulator'
import {
  createAgentFunctionCallOutputs,
  type ExecuteAgentBatchToolCall,
} from './agentToolCallOutputs'

type ReferenceImages = {
  dataUrls: string[]
  imageIds: string[]
}

export async function processAgentResponseTurn(input: {
  result: AgentApiResult
  streamedOutputItems: ResponsesOutputItem[]
  accumulatedOutputItems: ResponsesOutputItem[]
  textState: AgentResponseTextAccumulator
  textBeforeResponse: string
  shouldStreamAssistantMessage: boolean
  appendVisibleText: (text: string) => void
  taskIdByToolCallId: Map<string, string>
  streamingTaskIds: string[]
  completeExistingImageTask: (image: AgentApiResultImage, rawResponsePayload?: string) => Promise<string>
  createCompletedImageTask: (image: AgentApiResultImage, referenceImageIds: string[], rawResponsePayload?: string) => Promise<void>
  resolveReferenceImages: (referenceIds: string[]) => Promise<ReferenceImages>
  getTask: (taskId: string) => TaskRecord | undefined
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
  executeBatchFunctionCall: ExecuteAgentBatchToolCall
}) {
  const currentResponseOutputItems = input.streamedOutputItems.length
    ? input.streamedOutputItems
    : input.result.outputItems ?? []
  const accumulatedOutputItems = mergeResponseOutputItems(input.accumulatedOutputItems, currentResponseOutputItems)

  appendAgentResponseTextResult(input.textState, {
    responseText: input.result.text,
    textBeforeResponse: input.textBeforeResponse,
    appendVisibleText: input.shouldStreamAssistantMessage ? input.appendVisibleText : undefined,
  })

  await completeAgentResponseImages({
    images: input.result.images,
    rawResponsePayload: input.result.rawResponsePayload,
    taskIdByToolCallId: input.taskIdByToolCallId,
    streamingTaskIds: input.streamingTaskIds,
    completeExistingImageTask: input.completeExistingImageTask,
    createCompletedImageTask: input.createCompletedImageTask,
    resolveReferenceImages: input.resolveReferenceImages,
    getTask: input.getTask,
    updateTask: input.updateTask,
  })

  const { functionCallOutputs, toolCallCountIncrement } = await createAgentFunctionCallOutputs(
    currentResponseOutputItems,
    input.executeBatchFunctionCall,
  )

  return {
    accumulatedOutputItems,
    currentResponseOutputItems,
    functionCallOutputs,
    toolCallCountIncrement,
  }
}
