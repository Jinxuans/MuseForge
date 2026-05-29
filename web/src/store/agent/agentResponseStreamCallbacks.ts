import type { AgentApiResultImage } from '../../lib/agentApi'
import type { ResponsesOutputItem } from '../../types'
import {
  appendAgentResponseTextDelta,
  type AgentResponseTextAccumulator,
} from './agentResponseTextAccumulator'

export type AgentResponseStreamCallbackState = {
  currentResponseOutputItems: ResponsesOutputItem[]
}

export function createAgentResponseStreamCallbacks(input: {
  enabled: boolean
  signal: AbortSignal
  textState: AgentResponseTextAccumulator
  appendVisibleText: (text: string) => void
  onOutputItems: (outputItems: ResponsesOutputItem[]) => void
  ensureStreamingAgentTask: (toolCallId: string) => Promise<string>
  setTaskStreamPreview: (taskId: string, image?: string, requestIndex?: number) => void
  persistTaskStreamPartialImage: (taskId: string, dataUrl: string) => Promise<unknown> | unknown
  completeAgentImageTask: (image: AgentApiResultImage) => Promise<string>
}) {
  const state: AgentResponseStreamCallbackState = {
    currentResponseOutputItems: [],
  }

  if (!input.enabled) {
    return { state, callbacks: {} }
  }

  return {
    state,
    callbacks: {
      onTextDelta(delta: string) {
        if (input.signal.aborted) return
        appendAgentResponseTextDelta(input.textState, delta, input.appendVisibleText)
      },
      onOutputItems(outputItems: ResponsesOutputItem[]) {
        if (input.signal.aborted) return
        state.currentResponseOutputItems = outputItems
        input.onOutputItems(outputItems)
      },
      async onImageToolStarted({ toolCallId }: { toolCallId: string }) {
        if (input.signal.aborted) return
        await input.ensureStreamingAgentTask(toolCallId)
      },
      async onImagePartialImage({ toolCallId, image, partialImageIndex }: { toolCallId: string; image: string; partialImageIndex?: number }) {
        if (input.signal.aborted) return
        const taskId = await input.ensureStreamingAgentTask(toolCallId)
        if (input.signal.aborted) return
        input.setTaskStreamPreview(taskId, image, partialImageIndex)
        if (partialImageIndex === 0 || partialImageIndex == null) {
          void input.persistTaskStreamPartialImage(taskId, image)
        }
      },
      async onImageToolCompleted(image: AgentApiResultImage) {
        if (input.signal.aborted) return
        await input.completeAgentImageTask(image)
      },
    },
  }
}
