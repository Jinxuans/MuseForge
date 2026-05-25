export const MIN_SCALE = 1
export const MAX_SCALE = 10
export const SWIPE_INTENT_THRESHOLD = 10
export const SWIPE_ACTION_THRESHOLD = 40
export const DOUBLE_TAP_DELAY = 350
export const DOUBLE_TAP_DISTANCE = 40

export type TouchIntent = 'none' | 'horizontal-swipe' | 'vertical-move' | 'zoom-pan' | 'pinch'

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}
