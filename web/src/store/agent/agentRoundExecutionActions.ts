import type { AgentConversation, ApiProfile, AppSettings, TaskParams, TaskRecord } from '../../types'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import {
  appendAgentAssistantMessageDelta,
  completeAgentRoundInConversation,
  failAgentRoundInConversation,
  getActiveAgentRounds,
  stopAgentRoundInConversation,
} from './agentRounds'
import { buildAgentApiInput } from './agentApiInputItems'
import { AGENT_STOPPED_MESSAGE, createAgentAbortError, getAgentRoundControllerKey } from './agentRuntimeDomain'
import { createCompletedAgentAssistantMessage } from './agentRoundCompletion'
import { getAgentRoundFailureMessage } from './agentRoundFailure'
import { runAgentRoundStateMachine } from './agentRoundStateMachine'
import { createAgentRoundTaskBridge } from './agentRoundTaskBridge'
import type { AppState } from '../appState'
import { genId } from '../shared'

type AgentRoundExecutionState = Pick<
  AppState,
  | 'tasks'
  | 'activeAgentConversationId'
  | 'agentConversations'
  | 'showToast'
  | 'setTaskStreamPreview'
>

type AgentRoundExecutionActionsDeps = {
  createTaskExecutionContext: () => TaskExecutionContext
  getState: () => AgentRoundExecutionState
  persistTaskStreamPartialImage: (taskId: string, dataUrl: string) => Promise<unknown> | unknown
  updateAgentConversation: (conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) => void
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
}

export function createAgentRoundExecutionActions({
  createTaskExecutionContext,
  getState,
  persistTaskStreamPartialImage,
  updateAgentConversation,
  updateTask,
}: AgentRoundExecutionActionsDeps) {
  const agentRoundControllers = new Map<string, AbortController>()

  function markAgentRoundTasksStopped(conversationId: string, roundId: string, now = Date.now()) {
    const runningTasks = getState().tasks.filter((task) =>
      task.status === 'running' &&
      task.agentConversationId === conversationId &&
      task.agentRoundId === roundId,
    )

    for (const task of runningTasks) {
      updateTask(task.id, {
        status: 'error',
        error: AGENT_STOPPED_MESSAGE,
        falRecoverable: false,
        customRecoverable: false,
        finishedAt: now,
        elapsed: Math.max(0, now - task.createdAt),
      })
    }
    return runningTasks.length > 0
  }

  function markAgentRoundStopped(conversationId: string, roundId: string) {
    const now = Date.now()
    const stoppedTasks = markAgentRoundTasksStopped(conversationId, roundId, now)
    let stoppedRound = false
    updateAgentConversation(conversationId, (current) => {
      const result = stopAgentRoundInConversation(current, roundId, now)
      stoppedRound = result.stopped
      return result.conversation
    })
    return stoppedRound || stoppedTasks
  }

  function appendAgentAssistantMessageContent(conversationId: string, messageId: string, delta: string) {
    if (!delta) return
    updateAgentConversation(conversationId, (current) => appendAgentAssistantMessageDelta(current, messageId, delta))
  }

  function stopAgentResponse(conversationId = getState().activeAgentConversationId) {
    if (!conversationId) return
    const conversation = getState().agentConversations.find((item) => item.id === conversationId)
    if (!conversation) return
    const activeRunningRound = [...getActiveAgentRounds(conversation)].reverse().find((round) => round.status === 'running')
    const runningRound = activeRunningRound ?? conversation.rounds.find((round) => round.status === 'running')
    if (!runningRound) return

    const controller = agentRoundControllers.get(getAgentRoundControllerKey(conversationId, runningRound.id))
    if (controller) {
      controller.abort()
      if (markAgentRoundStopped(conversationId, runningRound.id)) {
        getState().showToast('已停止生成', 'info')
      }
      return
    }

    markAgentRoundStopped(conversationId, runningRound.id)
    getState().showToast('已停止生成', 'info')
  }

  async function executeAgentRound(
    conversationId: string,
    roundId: string,
    params: TaskParams,
    requestSettings: AppSettings,
    activeProfile: ApiProfile,
  ) {
    const startedAt = Date.now()
    const controller = new AbortController()
    const controllerKey = getAgentRoundControllerKey(conversationId, roundId)
    agentRoundControllers.set(controllerKey, controller)
    try {
      const latestState = getState()
      const conversation = latestState.agentConversations.find((item) => item.id === conversationId)
      if (!conversation) return
      const round = conversation.rounds.find((item) => item.id === roundId)
      const userMessage = round ? conversation.messages.find((message) => message.id === round.userMessageId) : null
      if (!round || !userMessage) return
      const maskDataUrl = (round.maskImageId ? await createTaskExecutionContext().ensureImageCached(round.maskImageId) : undefined) ?? undefined
      if (round.maskImageId && !maskDataUrl) throw new Error('遮罩图片已不存在')

      const apiInput = await buildAgentApiInput(conversation, round, latestState.tasks)
      if (controller.signal.aborted) throw createAgentAbortError()
      const existingAssistantMessage = round.assistantMessageId
        ? conversation.messages.find((message) => message.id === round.assistantMessageId) ?? null
        : conversation.messages.find((message) => message.roundId === roundId && message.role === 'assistant') ?? null
      const assistantMessageId = existingAssistantMessage?.id ?? genId()
      const taskBridge = createAgentRoundTaskBridge({
        createTaskExecutionContext,
        getState,
        updateAgentConversation,
        conversationId,
        roundId,
        assistantMessageId,
        round,
        params,
        activeProfile,
        completedImagePromptFallback: round.prompt ?? userMessage.content,
        startedAt,
      })

      const roundResult = await runAgentRoundStateMachine({
        conversationId,
        roundId,
        assistantMessageId,
        params,
        requestSettings,
        activeProfile,
        apiInput,
        maskDataUrl,
        signal: controller.signal,
        taskBridge,
        getState,
        updateAgentConversation,
        updateTask,
        persistTaskStreamPartialImage,
        appendAssistantMessageContent: (delta) => appendAgentAssistantMessageContent(conversationId, assistantMessageId, delta),
      })

      const taskIds: string[] = [...taskBridge.streamingTaskIds]
      const outputIds = taskIds.flatMap((taskId) => getState().tasks.find((task) => task.id === taskId)?.outputImages ?? [])
      const assistantMessage = createCompletedAgentAssistantMessage({
        assistantMessageId,
        roundId,
        taskIds,
        outputImageCount: outputIds.length,
        textSegments: roundResult.textSegments,
        reachedToolLimit: roundResult.reachedToolLimit,
        maxToolCalls: roundResult.maxToolCalls,
      })

      updateAgentConversation(conversationId, (current) =>
        completeAgentRoundInConversation(
          current,
          roundId,
          assistantMessage,
          taskIds,
          roundResult.accumulatedOutputItems,
          roundResult.lastResponseId,
        ),
      )

      getState().showToast(outputIds.length > 0 ? 'Agent 已生成图片' : 'Agent 已回复', 'success')
    } catch (err) {
      if (controller.signal.aborted) {
        if (markAgentRoundStopped(conversationId, roundId)) {
          getState().showToast('已停止生成', 'info')
        }
        return
      }

      const message = getAgentRoundFailureMessage({ err, startedAt, activeProfile, requestSettings })

      updateAgentConversation(conversationId, (current) =>
        failAgentRoundInConversation(current, roundId, message, genId()),
      )
      getState().showToast(`Agent 请求失败：${message}`, 'error')
    } finally {
      if (agentRoundControllers.get(controllerKey) === controller) {
        agentRoundControllers.delete(controllerKey)
      }
    }
  }

  return {
    executeAgentRound,
    stopAgentResponse,
  }
}
