import type { AgentConversation, ApiProfile, AppSettings } from '../../types'
import { generateAgentConversationTitle as generateAgentConversationTitleInService } from '../../services/agentRuntime'
import type { AppState } from '../appState'
import { updateAgentConversationTitleIfUnchanged } from './agentRounds'

type AgentTitleActionsDeps = {
  setState: (updater: (state: AppState) => Partial<AppState>) => void
  updateAgentConversation: (conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) => void
}

export function createAgentTitleActions({
  setState,
  updateAgentConversation,
}: AgentTitleActionsDeps) {
  return {
    async generateAgentConversationTitle(
      conversationId: string,
      prompt: string,
      inputImageIds: string[],
      requestSettings: AppSettings,
      activeProfile: ApiProfile,
      fallbackTitle: string,
    ) {
      setState((state) => {
        const next = { ...state.agentGeneratingTitleIds, [conversationId]: true as const }
        return { agentGeneratingTitleIds: next }
      })
      try {
        const title = await generateAgentConversationTitleInService({
          settings: requestSettings,
          profile: activeProfile,
          prompt,
          inputImageIds,
          fallbackTitle,
        })
        if (!title) return

        updateAgentConversation(conversationId, (current) =>
          updateAgentConversationTitleIfUnchanged(current, prompt, fallbackTitle, title),
        )
      } catch {
        // Title generation is best-effort; keep the local fallback title on failure.
      } finally {
        setState((state) => {
          const next = { ...state.agentGeneratingTitleIds }
          delete next[conversationId]
          return { agentGeneratingTitleIds: next }
        })
      }
    },
  }
}
