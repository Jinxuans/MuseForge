import type { TaskRecord } from '../../types'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import type { AppState } from '../appState'
import { createAgentMessageActions } from '../agent/agentMessageActions'
import { createAgentRoundExecutionActions } from '../agent/agentRoundExecutionActions'
import { createAgentTitleActions } from '../agent/agentTitleActions'
import { createAgentStoreUpdates } from './agentStoreUpdates'

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

type StoreAgentActionsDeps = {
  createTaskExecutionContext: () => TaskExecutionContext
  getState: () => AppState
  persistTaskStreamPartialImage: (taskId: string, dataUrl: string) => Promise<unknown> | unknown
  setState: StoreSetState
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
}

export function createStoreAgentActions({
  createTaskExecutionContext,
  getState,
  persistTaskStreamPartialImage,
  setState,
  updateTask,
}: StoreAgentActionsDeps) {
  const agentStoreUpdates = createAgentStoreUpdates({
    getState,
    setState,
  })

  const updateAgentConversation = agentStoreUpdates.updateAgentConversation

  const agentTitleActions = createAgentTitleActions({
    setState: (updater) => setState(updater),
    updateAgentConversation,
  })

  const agentRoundExecutionActions = createAgentRoundExecutionActions({
    createTaskExecutionContext,
    getState,
    persistTaskStreamPartialImage,
    updateAgentConversation,
    updateTask,
  })

  const agentMessageActions = createAgentMessageActions({
    executeAgentRound: agentRoundExecutionActions.executeAgentRound,
    generateAgentConversationTitle: agentTitleActions.generateAgentConversationTitle,
    getActiveAgentConversation: agentStoreUpdates.getActiveAgentConversation,
    getState,
    updateAgentConversation,
  })

  return {
    regenerateAgentAssistantMessage: agentMessageActions.regenerateAgentAssistantMessage,
    stopAgentResponse: agentRoundExecutionActions.stopAgentResponse,
    submitAgentMessage: agentMessageActions.submitAgentMessage,
  }
}
