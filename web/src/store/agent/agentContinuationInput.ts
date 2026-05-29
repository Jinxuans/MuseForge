import type { AgentRound, ResponsesOutputItem, TaskRecord } from '../../types'
import { buildAgentContinuationInput, createAgentBatchImagesInputItem } from './agentApiInputItems'

export async function createAgentContinuationTurnInput(input: {
  baseInput: unknown[]
  round: AgentRound
  tasks: TaskRecord[]
  accumulatedOutputItems: ResponsesOutputItem[]
  functionCallOutputs: ResponsesOutputItem[]
  streamingTaskIds: string[]
  toolCallsUsed: number
  maxToolCalls: number
}) {
  const continuationInput = buildAgentContinuationInput(
    input.baseInput,
    input.round,
    input.tasks,
    input.accumulatedOutputItems,
    input.toolCallsUsed,
    input.maxToolCalls,
  )
  continuationInput.splice(continuationInput.length - 1, 0, ...input.functionCallOutputs)

  const batchImagesItem = await createAgentBatchImagesInputItem(input.round, input.tasks, input.streamingTaskIds)
  if (batchImagesItem) continuationInput.splice(continuationInput.length - 1, 0, batchImagesItem)

  return continuationInput
}
