export type AgentResponseTextAccumulator = {
  accumulatedText: string
  textSegments: string[]
  pendingToolTextSeparator: boolean
}

export function createAgentResponseTextAccumulator(): AgentResponseTextAccumulator {
  return {
    accumulatedText: '',
    textSegments: [],
    pendingToolTextSeparator: false,
  }
}

export function appendAgentResponseTextDelta(
  state: AgentResponseTextAccumulator,
  delta: string,
  appendVisibleText: (delta: string) => void,
) {
  if (state.pendingToolTextSeparator && delta && state.accumulatedText.trim()) {
    state.accumulatedText += '\n\n'
    appendVisibleText('\n\n')
  }

  state.pendingToolTextSeparator = false
  state.accumulatedText += delta
  appendVisibleText(delta)
}

export function appendAgentResponseTextResult(
  state: AgentResponseTextAccumulator,
  input: {
    responseText: string
    textBeforeResponse: string
    appendVisibleText?: (text: string) => void
  },
) {
  const responseText = input.responseText.trim()
  if (responseText && state.accumulatedText === input.textBeforeResponse) {
    const textToAppend = state.accumulatedText ? `\n\n${responseText}` : responseText
    state.accumulatedText += textToAppend
    input.appendVisibleText?.(textToAppend)
  }

  const newTextInThisResponse = state.accumulatedText.slice(input.textBeforeResponse.length).trim()
  if (newTextInThisResponse) state.textSegments.push(newTextInThisResponse)
}

export function markAgentResponsePendingToolTextSeparator(state: AgentResponseTextAccumulator) {
  state.pendingToolTextSeparator = true
}
