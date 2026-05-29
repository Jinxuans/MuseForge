import type { ResponsesOutputItem } from '../../types'
import { countResponseToolCalls } from './agentResponseOutput'

export type ExecuteAgentBatchToolCall = (functionCallItem: ResponsesOutputItem) => Promise<{
  output: string
  successCount: number
}>

export async function createAgentFunctionCallOutputs(
  outputItems: ResponsesOutputItem[],
  executeBatchFunctionCall: ExecuteAgentBatchToolCall,
) {
  const batchFunctionCalls = outputItems.filter(
    (item) => item.type === 'function_call' && item.name === 'generate_image_batch',
  )
  const continueFunctionCalls = outputItems.filter(
    (item) => item.type === 'function_call' && item.name === 'continue_generation',
  )

  const functionCallOutputs: ResponsesOutputItem[] = []
  let batchSuccessCount = 0

  for (const fc of batchFunctionCalls) {
    const { output, successCount } = await executeBatchFunctionCall(fc)
    batchSuccessCount += successCount
    functionCallOutputs.push({
      type: 'function_call_output',
      call_id: fc.call_id,
      output,
    })
  }

  for (const fc of continueFunctionCalls) {
    functionCallOutputs.push({
      type: 'function_call_output',
      call_id: fc.call_id,
      output: JSON.stringify({ status: 'continued' }),
    })
  }

  return {
    functionCallOutputs,
    toolCallCountIncrement: countResponseToolCalls(outputItems) + batchSuccessCount,
  }
}
