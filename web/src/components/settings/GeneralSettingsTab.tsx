import type { AppSettings } from '../../types'
import Select from '../Select'

interface GeneralSettingsTabProps {
  draft: AppSettings
  onCommitSettings: (settings: AppSettings) => void
}

function SettingsToggle({
  checked,
  label,
  description,
  onChange,
}: {
  checked: boolean
  label: string
  description: string
  onChange: () => void
}) {
  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between">
        <span className="block text-sm text-gray-600 dark:text-gray-300">{label}</span>
        <button
          type="button"
          onClick={onChange}
          className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          role="switch"
          aria-checked={checked}
          aria-label={label}
        >
          <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
        </button>
      </div>
      <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
        {description}
      </div>
    </div>
  )
}

export default function GeneralSettingsTab({ draft, onCommitSettings }: GeneralSettingsTabProps) {
  return (
    <div className="space-y-4">
      <div className="hidden sm:block">
        <div className="mb-1 flex items-center justify-between">
          <span className="block text-sm text-gray-600 dark:text-gray-300">任务提交方式</span>
          <div className="w-32">
            <Select
              value={draft.enterSubmit ? 'enter' : 'ctrl-enter'}
              onChange={(val) => onCommitSettings({ ...draft, enterSubmit: val === 'enter' })}
              options={[
                { label: 'Enter', value: 'enter' },
                { label: navigator.userAgent.includes('Mac') ? 'Cmd + Enter' : 'Ctrl + Enter', value: 'ctrl-enter' },
              ]}
              className="w-full px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-xs transition-all duration-200 shadow-sm text-gray-700 dark:text-gray-200 outline-none"
            />
          </div>
        </div>
        <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
          选择 Enter 提交时，使用 Shift + Enter 换行；否则直接 Enter 换行。
        </div>
      </div>

      <SettingsToggle
        checked={draft.clearInputAfterSubmit}
        label="提交任务后清空输入框"
        description="开启后，提交成功创建任务时会清空提示词和参考图。"
        onChange={() => onCommitSettings({ ...draft, clearInputAfterSubmit: !draft.clearInputAfterSubmit })}
      />

      <div className="block">
        <div className="mb-1 flex items-center justify-between gap-3">
          <span className="block text-sm text-gray-600 dark:text-gray-300">参考图编辑按钮</span>
          <div className="w-32">
            <Select
              value={draft.referenceImageEditAction}
              onChange={(val) => onCommitSettings({ ...draft, referenceImageEditAction: val as AppSettings['referenceImageEditAction'] })}
              options={[
                { label: '询问', value: 'ask' },
                { label: '替换参考图', value: 'replace-reference' },
                { label: '添加遮罩', value: 'add-mask' },
              ]}
              className="w-full px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-xs transition-all duration-200 shadow-sm text-gray-700 dark:text-gray-200 outline-none"
            />
          </div>
        </div>
        <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
          控制未添加遮罩的参考图点击编辑按钮时，是每次询问、直接替换参考图，还是直接添加遮罩。
        </div>
      </div>

      <SettingsToggle
        checked={draft.persistInputOnRestart}
        label="重启后加载上次的输入框"
        description="关闭后，不再持久化提示词和参考图，下次启动会使用空输入框。"
        onChange={() => onCommitSettings({ ...draft, persistInputOnRestart: !draft.persistInputOnRestart })}
      />

      <SettingsToggle
        checked={draft.reuseTaskApiProfileTemporarily}
        label="复用配置时临时复用该任务的 API 配置"
        description="开启后，复用历史任务时会临时使用该任务的 API 配置，找不到该配置时提交会提示；关闭后，会继续使用当前的 API 配置。"
        onChange={() => onCommitSettings({ ...draft, reuseTaskApiProfileTemporarily: !draft.reuseTaskApiProfileTemporarily })}
      />

      <SettingsToggle
        checked={draft.alwaysShowRetryButton}
        label="成功任务仍然展示重试按钮"
        description="开启后，即使任务成功生成，也会在任务卡片和详情页显示重试按钮。"
        onChange={() => onCommitSettings({ ...draft, alwaysShowRetryButton: !draft.alwaysShowRetryButton })}
      />

      <SettingsToggle
        checked={draft.agentScrollToBottomAfterSubmit}
        label="发送消息后自动滚动到底部"
        description="开启后，在 Agent 模式发送消息成功后会自动滚动到对话底部。"
        onChange={() => onCommitSettings({ ...draft, agentScrollToBottomAfterSubmit: !draft.agentScrollToBottomAfterSubmit })}
      />
    </div>
  )
}
