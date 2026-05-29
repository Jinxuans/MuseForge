import type { ApiProfile, AppSettings, ResponsesOutputItem, TaskParams } from '../types'
import { callAgentConversationTitleApi, callBatchImageSingle, parseBatchImageCallArguments, type AgentApiResultImage } from '../lib/agentApi'
import { extractAgentReferenceIds } from '../lib/agentImageReferences'
import { readAgentImageDataUrls } from '../store/agent/agentApiInputItems'

type ReferenceImages = {
  dataUrls: string[]
  imageIds: string[]
}

type EnsureAgentTaskOptions = {
  createdAt?: number
  agentBatchCallId?: string
  maskTargetImageId?: string | null
  maskImageId?: string | null
}

export type ExecuteBatchImageFunctionCallContext = {
  profile: ApiProfile
  params: TaskParams
  signal: AbortSignal
  shouldStreamAssistantMessage: boolean
  genId: () => string
  resolveReferenceImages: (referenceIds: string[]) => Promise<ReferenceImages>
  ensureStreamingAgentTask: (
    toolCallId: string,
    taskPrompt?: string,
    inputImageIds?: string[],
    options?: EnsureAgentTaskOptions,
  ) => Promise<string>
  completeAgentImageTask: (image: AgentApiResultImage, rawResponsePayload?: string) => Promise<string>
  getTaskIdByToolCallId: (toolCallId: string) => string | undefined
  setTaskStreamPreview: (taskId: string, image?: string, requestIndex?: number) => void
  persistTaskStreamPartialImage: (taskId: string, dataUrl: string) => Promise<unknown> | unknown
}

export type ExecuteBatchImageFunctionCallResult = {
  output: string
  successCount: number
}

export async function generateAgentConversationTitle(input: {
  settings: AppSettings
  profile: ApiProfile
  prompt: string
  inputImageIds: string[]
  fallbackTitle: string
}) {
  const imageDataUrls = await readAgentImageDataUrls(input.inputImageIds)
  const title = await callAgentConversationTitleApi({
    settings: input.settings,
    profile: input.profile,
    prompt: input.prompt,
    imageDataUrls,
  })
  return title && title !== input.fallbackTitle ? title : null
}

export async function executeBatchImageFunctionCall(
  ctx: ExecuteBatchImageFunctionCallContext,
  functionCallItem: ResponsesOutputItem,
): Promise<ExecuteBatchImageFunctionCallResult> {
  const callId = functionCallItem.call_id ?? ''
  const args = functionCallItem.arguments ?? ''
  const batchItems = parseBatchImageCallArguments(args)

  if (!batchItems || batchItems.length === 0) {
    return {
      output: JSON.stringify({ error: 'Invalid or empty batch arguments' }),
      successCount: 0,
    }
  }

  const batchExecutionItems = []
  for (const item of batchItems) {
    const referenceIds = uniqueIds(extractAgentReferenceIds(item.prompt))
    const references = await ctx.resolveReferenceImages(referenceIds)
    const batchToolCallId = ctx.genId()
    await ctx.ensureStreamingAgentTask(batchToolCallId, item.prompt, references.imageIds, {
      createdAt: Date.now(),
      maskTargetImageId: null,
      maskImageId: null,
      ...(callId ? { agentBatchCallId: callId } : {}),
    })
    batchExecutionItems.push({ item, batchToolCallId, references, referenceIds })
  }

  const batchPromises = batchExecutionItems.map(async ({ item, batchToolCallId, references, referenceIds }) => {
    const batchResult = await callBatchImageSingle({
      profile: ctx.profile,
      params: ctx.params,
      batchItemId: item.id,
      prompt: item.prompt,
      referenceImageDataUrls: references.dataUrls,
      referenceIds,
      signal: ctx.signal,
      onImageToolStarted: ctx.shouldStreamAssistantMessage
        ? async () => {
            if (ctx.signal.aborted) return
          }
        : undefined,
      onPartialImage: ctx.shouldStreamAssistantMessage
        ? async ({ image, partialImageIndex }) => {
            if (ctx.signal.aborted) return
            const taskId = ctx.getTaskIdByToolCallId(batchToolCallId)
            if (!taskId) return
            ctx.setTaskStreamPreview(taskId, image, partialImageIndex)
            if (partialImageIndex === 0 || partialImageIndex == null) {
              void ctx.persistTaskStreamPartialImage(taskId, image)
            }
          }
        : undefined,
      onImageToolCompleted: ctx.shouldStreamAssistantMessage
        ? async (image) => {
            if (ctx.signal.aborted) return
            await ctx.completeAgentImageTask({ ...image, toolCallId: batchToolCallId })
          }
        : undefined,
    })

    if (batchResult.image && !ctx.shouldStreamAssistantMessage) {
      await ctx.completeAgentImageTask({ ...batchResult.image, toolCallId: batchToolCallId }, batchResult.rawResponsePayload)
    }

    return batchResult
  })

  const batchResults = await Promise.allSettled(batchPromises)
  const outputImages: Array<{ id: string; status: string; error?: string }> = []
  for (let i = 0; i < batchItems.length; i++) {
    const settled = batchResults[i]
    const batchItem = batchItems[i]
    if (settled.status === 'fulfilled') {
      const result = settled.value
      outputImages.push({
        id: result.batchItemId,
        status: result.image ? 'done' : 'error',
        ...(result.error ? { error: result.error } : {}),
      })
    } else {
      outputImages.push({
        id: batchItem.id,
        status: 'error',
        error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
      })
    }
  }

  return {
    output: JSON.stringify({ images: outputImages }),
    successCount: outputImages.filter((img) => img.status === 'done').length,
  }
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids)]
}
