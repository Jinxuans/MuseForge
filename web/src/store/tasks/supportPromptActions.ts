import type { AppState } from '../appState'
import { getCodexCliPromptKey } from './taskDomain'

type SupportPromptActionState = Pick<
  AppState,
  | 'settings'
  | 'dismissedCodexCliPrompts'
  | 'setConfirmDialog'
  | 'dismissCodexCliPrompt'
  | 'setSettings'
>

type SupportPromptActionsDeps = {
  getState: () => SupportPromptActionState
}

export function createSupportPromptActions({ getState }: SupportPromptActionsDeps) {
  return {
    showCodexCliPrompt(force = false, reason = '接口返回的提示词已被改写') {
      const state = getState()
      const settings = state.settings
      const promptKey = getCodexCliPromptKey(settings)
      if (!force && (settings.codexCli || state.dismissedCodexCliPrompts.includes(promptKey))) return

      state.setConfirmDialog({
        title: '检测到 Codex CLI API',
        message: `${reason}，当前 API 来源很可能是 Codex CLI。\n\n是否开启 Codex CLI 兼容模式？开启后会禁用在此处无效的质量参数，并在 Images API 多图生成时使用并发请求，解决该 API 数量参数无效的问题。同时，提示词文本开头会加入简短的不改写要求，避免模型重写提示词，偏离原意。`,
        confirmText: '开启',
        action: () => {
          const state = getState()
          state.dismissCodexCliPrompt(promptKey)
          state.setSettings({ codexCli: true })
        },
        cancelAction: () => getState().dismissCodexCliPrompt(promptKey),
      })
    },
  }
}
