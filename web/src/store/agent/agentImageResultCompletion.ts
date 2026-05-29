import type { AgentApiResultImage } from '../../lib/agentApi'
import { extractAgentReferenceIds } from '../../lib/agentImageReferences'
import type { TaskRecord } from '../../types'
import { uniqueIds } from './agentRuntimeDomain'

type ReferenceImages = {
  imageIds: string[]
}

export async function completeAgentResponseImages(input: {
  images: AgentApiResultImage[]
  rawResponsePayload?: string
  taskIdByToolCallId: Map<string, string>
  streamingTaskIds: string[]
  completeExistingImageTask: (image: AgentApiResultImage, rawResponsePayload?: string) => Promise<string>
  createCompletedImageTask: (image: AgentApiResultImage, referenceImageIds: string[], rawResponsePayload?: string) => Promise<void>
  resolveReferenceImages: (referenceIds: string[]) => Promise<ReferenceImages>
  getTask: (taskId: string) => TaskRecord | undefined
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
}) {
  const mergePromptReferenceInputs = async (image: AgentApiResultImage, taskId: string) => {
    const promptRefIds = uniqueIds(extractAgentReferenceIds(image.revisedPrompt ?? ''))
    if (promptRefIds.length === 0) return

    const promptRefs = await input.resolveReferenceImages(promptRefIds)
    if (promptRefs.imageIds.length === 0) return

    const latestTask = input.getTask(taskId)
    if (!latestTask) return

    const mergedInputIds = uniqueIds([...latestTask.inputImageIds, ...promptRefs.imageIds])
    if (mergedInputIds.length !== latestTask.inputImageIds.length) {
      input.updateTask(taskId, { inputImageIds: mergedInputIds })
    }
  }

  for (const image of input.images) {
    if (image.toolCallId && input.taskIdByToolCallId.has(image.toolCallId)) {
      const completedTaskId = await input.completeExistingImageTask(image, input.rawResponsePayload)
      await mergePromptReferenceInputs(image, completedTaskId)
      continue
    }

    const promptRefIds = uniqueIds(extractAgentReferenceIds(image.revisedPrompt ?? ''))
    const promptRefs = await input.resolveReferenceImages(promptRefIds)
    await input.createCompletedImageTask(image, promptRefs.imageIds, input.rawResponsePayload)
  }

  if (!input.rawResponsePayload || input.streamingTaskIds.length === 0) return

  for (const taskId of input.streamingTaskIds) {
    const latestTask = input.getTask(taskId)
    if (latestTask && !latestTask.rawResponsePayload) {
      input.updateTask(taskId, { rawResponsePayload: input.rawResponsePayload })
    }
  }
}
