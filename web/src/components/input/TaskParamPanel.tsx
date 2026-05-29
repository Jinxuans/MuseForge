import type { KeyboardEvent, WheelEvent } from 'react'
import type { TaskParams } from '../../types'
import Select from '../../shared/ui/Select'
import { ButtonTooltip } from './InputBarParts'

type HintController = {
  visible: boolean
  show: () => void
  hide: () => void
  startTouch: () => void
  clearTimer: () => void
}

type Option = { label: string; value: string }

const CONTROL_CLASS = 'px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] focus:outline-none text-xs transition-all duration-200 shadow-sm'
const DISABLED_CONTROL_CLASS = 'px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-gray-100/50 dark:bg-white/[0.05] opacity-50 cursor-not-allowed text-xs transition-all duration-200 shadow-sm'
const FORMAT_OPTIONS = [
  { label: 'PNG', value: 'png' },
  { label: 'JPEG', value: 'jpeg' },
  { label: 'WebP', value: 'webp' },
]
const MODERATION_OPTIONS = [
  { label: 'auto', value: 'auto' },
  { label: 'low', value: 'low' },
]

type TaskParamPanelProps = {
  cols: string
  params: TaskParams
  settingsCodexCli: boolean
  isFalProvider: boolean
  isFalTextToImage: boolean
  displaySize: string
  qualityOptions: Option[]
  selectClass: string
  outputCompressionInput: string
  compressionDisabled: boolean
  moderationDisabled: boolean
  agentAutoImageCount: boolean
  outputImageLimit: number
  nInput: string
  nLimitHintText: string
  streamConcurrentByN: boolean
  sizeHint: HintController
  qualityHint: HintController
  compressionHint: HintController
  moderationHint: HintController
  nLimitHint: Pick<HintController, 'visible'>
  setShowSizePicker: (show: boolean) => void
  dismissTooltips: () => void
  setParams: (params: Partial<TaskParams>) => void
  setOutputCompressionInput: (value: string) => void
  commitOutputCompression: () => void
  showAgentNHint: () => void
  hideNLimitHint: () => void
  startAgentNHintTouch: () => void
  clearAgentNHintTouchTimer: () => void
  handleNInputChange: (value: string) => void
  setNInputFocused: (focused: boolean) => void
  commitN: () => void
  handleNLimitIncreaseAttempt: (preventDefault: () => void) => void
}

function getHintTriggerProps(hint: HintController) {
  return {
    onMouseEnter: hint.show,
    onMouseLeave: hint.hide,
    onTouchStart: hint.startTouch,
    onTouchEnd: hint.clearTimer,
    onTouchCancel: hint.hide,
    onClick: hint.show,
  }
}

function numberInputClass(disabled: boolean) {
  return `px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] focus:outline-none text-xs transition-all duration-200 shadow-sm ${
    disabled
      ? 'bg-gray-100/50 dark:bg-white/[0.05] opacity-50 cursor-not-allowed'
      : 'bg-white/50 dark:bg-white/[0.03]'
  }`
}

export default function TaskParamPanel({
  cols,
  params,
  settingsCodexCli,
  isFalProvider,
  isFalTextToImage,
  displaySize,
  qualityOptions,
  selectClass,
  outputCompressionInput,
  compressionDisabled,
  moderationDisabled,
  agentAutoImageCount,
  outputImageLimit,
  nInput,
  nLimitHintText,
  streamConcurrentByN,
  sizeHint,
  qualityHint,
  compressionHint,
  moderationHint,
  nLimitHint,
  setShowSizePicker,
  dismissTooltips,
  setParams,
  setOutputCompressionInput,
  commitOutputCompression,
  showAgentNHint,
  hideNLimitHint,
  startAgentNHintTouch,
  clearAgentNHintTouchTimer,
  handleNInputChange,
  setNInputFocused,
  commitN,
  handleNLimitIncreaseAttempt,
}: TaskParamPanelProps) {
  return (
    <div className={`grid ${cols} gap-2 text-xs flex-1`}>
      <label
        className="relative flex flex-col gap-0.5"
        {...getHintTriggerProps(sizeHint)}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">尺寸</span>
        <button
          type="button"
          onClick={() => { dismissTooltips(); setShowSizePicker(true) }}
          className={`${CONTROL_CLASS} text-left font-mono`}
          title="选择尺寸"
        >
          {displaySize}
        </button>
        <ButtonTooltip
          visible={isFalTextToImage && sizeHint.visible}
          text={<>fal.ai 的文生图模式不支持 <code className="rounded bg-white/10 px-1 py-0.5 font-mono">auto</code> 参数</>}
        />
      </label>
      <label
        className="relative flex flex-col gap-0.5"
        {...getHintTriggerProps(qualityHint)}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">质量</span>
        <Select
          value={settingsCodexCli ? 'auto' : isFalProvider && params.quality === 'auto' ? 'high' : params.quality}
          onChange={(val) => {
            if (!settingsCodexCli) setParams({ quality: val as TaskParams['quality'] })
          }}
          options={qualityOptions}
          disabled={settingsCodexCli}
          className={settingsCodexCli ? DISABLED_CONTROL_CLASS : selectClass}
        />
        <ButtonTooltip
          visible={(settingsCodexCli || isFalProvider) && qualityHint.visible}
          text={isFalProvider ? <>fal.ai 不支持 <code className="rounded bg-white/10 px-1 py-0.5 font-mono">auto</code> 质量参数</> : 'Codex CLI 不支持质量参数'}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-gray-400 dark:text-gray-500 ml-1">格式</span>
        <Select
          value={params.output_format}
          onChange={(val) => setParams({ output_format: val as TaskParams['output_format'] })}
          options={FORMAT_OPTIONS}
          className={selectClass}
        />
      </label>
      <label
        className="relative flex flex-col gap-0.5"
        {...getHintTriggerProps(compressionHint)}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">压缩率</span>
        <input
          value={outputCompressionInput}
          onChange={(e) => setOutputCompressionInput(e.target.value)}
          onBlur={commitOutputCompression}
          disabled={compressionDisabled}
          type="number"
          min={0}
          max={100}
          placeholder="0-100"
          className={numberInputClass(compressionDisabled)}
        />
        <ButtonTooltip
          visible={compressionHint.visible}
          text={isFalProvider ? 'fal.ai 不支持压缩率参数' : '仅 JPEG 和 WebP 支持压缩率'}
        />
      </label>
      <label
        className="relative flex flex-col gap-0.5"
        {...getHintTriggerProps(moderationHint)}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">审核</span>
        <Select
          value={moderationDisabled ? 'auto' : params.moderation}
          onChange={(val) => {
            if (!moderationDisabled) setParams({ moderation: val as TaskParams['moderation'] })
          }}
          options={MODERATION_OPTIONS}
          disabled={moderationDisabled}
          className={moderationDisabled ? DISABLED_CONTROL_CLASS : selectClass}
        />
        <ButtonTooltip
          visible={moderationDisabled && moderationHint.visible}
          text="fal.ai 不支持审核参数"
        />
      </label>
      <label
        className="relative flex flex-col gap-0.5"
        onMouseEnter={showAgentNHint}
        onMouseLeave={hideNLimitHint}
        onTouchStart={startAgentNHintTouch}
        onTouchEnd={clearAgentNHintTouchTimer}
        onTouchCancel={() => {
          clearAgentNHintTouchTimer()
          hideNLimitHint()
        }}
        onClick={showAgentNHint}
      >
        <span className="text-gray-400 dark:text-gray-500 ml-1">数量</span>
        <input
          value={nInput}
          onChange={(e) => handleNInputChange(e.target.value)}
          onFocus={() => setNInputFocused(true)}
          onBlur={() => {
            setNInputFocused(false)
            commitN()
          }}
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'ArrowUp') {
              handleNLimitIncreaseAttempt(() => e.preventDefault())
            }
          }}
          onWheel={(e: WheelEvent<HTMLInputElement>) => {
            if (e.deltaY < 0) {
              handleNLimitIncreaseAttempt(() => e.preventDefault())
            }
          }}
          disabled={agentAutoImageCount}
          type={agentAutoImageCount ? 'text' : 'number'}
          min={agentAutoImageCount ? undefined : 1}
          max={agentAutoImageCount ? undefined : outputImageLimit}
          className={numberInputClass(agentAutoImageCount)}
        />
        <ButtonTooltip visible={nLimitHint.visible} text={nLimitHintText} />
        <ButtonTooltip visible={streamConcurrentByN && !nLimitHint.visible} text="数量大于 1 时会将多图生成拆分为并发单图" />
      </label>
    </div>
  )
}
