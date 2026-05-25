import type { AppState } from './appState'

let uid = 0

export function genId(): string {
  return Date.now().toString(36) + (++uid).toString(36) + Math.random().toString(36).slice(2, 6)
}

export function resolveSelectedTaskIds(idsOrUpdater: string[] | ((prev: string[]) => string[]), selectedTaskIds: string[]) {
  return typeof idsOrUpdater === 'function' ? idsOrUpdater(selectedTaskIds) : idsOrUpdater
}

export function toggleTaskSelectionInList(selectedTaskIds: string[], id: string, force?: boolean) {
  const isSelected = selectedTaskIds.includes(id)
  const shouldSelect = force !== undefined ? force : !isSelected
  if (shouldSelect === isSelected) return selectedTaskIds
  return shouldSelect
    ? [...selectedTaskIds, id]
    : selectedTaskIds.filter((selectedId) => selectedId !== id)
}

export function setTaskStreamPreviewInState(
  state: Pick<AppState, 'streamPreviews' | 'streamPreviewSlots'>,
  taskId: string,
  image: string | undefined,
  requestIndex = 0,
): Pick<AppState, 'streamPreviews' | 'streamPreviewSlots'> | typeof state {
  if (image) {
    const slotKey = String(requestIndex)
    const currentSlots = state.streamPreviewSlots[taskId] ?? {}
    if (state.streamPreviews[taskId] === image && currentSlots[slotKey] === image) return state
    return {
      streamPreviews: { ...state.streamPreviews, [taskId]: image },
      streamPreviewSlots: {
        ...state.streamPreviewSlots,
        [taskId]: { ...currentSlots, [slotKey]: image },
      },
    }
  }

  if (!(taskId in state.streamPreviews) && !(taskId in state.streamPreviewSlots)) return state
  const next = { ...state.streamPreviews }
  const nextSlots = { ...state.streamPreviewSlots }
  delete next[taskId]
  delete nextSlots[taskId]
  return { streamPreviews: next, streamPreviewSlots: nextSlots }
}
