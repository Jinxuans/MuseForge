import type { AgentMessage } from '../../types'

export function createCompletedAgentAssistantMessage(input: {
  assistantMessageId: string
  roundId: string
  taskIds: string[]
  outputImageCount: number
  textSegments: string[]
  reachedToolLimit: boolean
  maxToolCalls: number
  now?: number
}): AgentMessage {
  const limitNotice = input.reachedToolLimit
    ? `已达到最大工具调用次数（${input.maxToolCalls}），已停止自动续跑。`
    : ''
  const joinedText = input.textSegments.join('\n\n').trim()
  const finalContent = [joinedText, limitNotice]
    .filter(Boolean)
    .join(joinedText ? '\n\n' : '')
    || (input.taskIds.length > 0 || input.outputImageCount > 0 ? '图像已生成。' : '')

  return {
    id: input.assistantMessageId,
    role: 'assistant',
    content: finalContent,
    roundId: input.roundId,
    outputTaskIds: input.taskIds,
    createdAt: input.now ?? Date.now(),
  }
}
