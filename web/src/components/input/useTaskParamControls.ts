import { useCallback, useEffect, useState } from 'react'
import type { ApiProfile, AppMode, AppSettings, TaskParams } from '../../types'
import { DEFAULT_PARAMS } from '../../types'
import { useHintTooltip } from '../../hooks/useHintTooltip'
import { DEFAULT_FAL_IMAGE_SIZE, getChangedParams, getOutputImageLimitForSettings, normalizeParamsForSettings } from '../../lib/paramCompatibility'
import { normalizeImageSize } from '../../lib/size'

type UseTaskParamControlsArgs = {
  activeProfile: ApiProfile
  appMode: AppMode
  effectiveSettings: AppSettings
  inputImageCount: number
  params: TaskParams
  setParams: (params: Partial<TaskParams>) => void
  settingsCodexCli: boolean
}

export function useTaskParamControls({
  activeProfile,
  appMode,
  effectiveSettings,
  inputImageCount,
  params,
  setParams,
  settingsCodexCli,
}: UseTaskParamControlsArgs) {
  const [outputCompressionInput, setOutputCompressionInput] = useState(
    params.output_compression == null ? '' : String(params.output_compression),
  )
  const [nInput, setNInput] = useState(String(params.n))
  const [nInputFocused, setNInputFocused] = useState(false)

  const isFalProvider = activeProfile.provider === 'fal'
  const agentAutoImageCount = appMode === 'agent' && activeProfile.provider === 'openai' && activeProfile.apiMode === 'responses'
  const moderationDisabled = isFalProvider
  const compressionDisabled = params.output_format === 'png' || isFalProvider
  const outputImageLimit = getOutputImageLimitForSettings(effectiveSettings)
  const isFalTextToImage = isFalProvider && inputImageCount === 0
  const nDraftValue = Number(nInput)
  const effectiveNValue = Number.isNaN(nDraftValue) ? params.n : nDraftValue
  const streamConcurrentByN = activeProfile.provider === 'openai' && activeProfile.streamImages === true && !agentAutoImageCount && effectiveNValue > 1
  const nLimitHintText = agentAutoImageCount
    ? 'Agent 模式下数量由模型根据提示词自动决定'
    : isFalProvider
    ? `fal.ai 最大请求数量为 ${outputImageLimit}`
    : `OpenAI 最大请求数量为 ${outputImageLimit}`
  const displaySize = isFalTextToImage && params.size === 'auto'
    ? DEFAULT_FAL_IMAGE_SIZE
    : normalizeImageSize(params.size) || DEFAULT_PARAMS.size
  const sizePickerCurrentSize = isFalTextToImage && params.size === 'auto' ? DEFAULT_FAL_IMAGE_SIZE : params.size
  const qualityOptions = isFalProvider
    ? [
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
      ]
    : [
        { label: 'auto', value: 'auto' },
        { label: 'low', value: 'low' },
        { label: 'medium', value: 'medium' },
        { label: 'high', value: 'high' },
      ]

  const compressionHint = useHintTooltip({ enabled: () => compressionDisabled })
  const moderationHint = useHintTooltip({ enabled: () => moderationDisabled })
  const sizeHint = useHintTooltip({ enabled: () => isFalTextToImage })
  const qualityHint = useHintTooltip({ enabled: () => settingsCodexCli || isFalProvider })
  const nLimitHint = useHintTooltip({ autoHideMs: 2000 })

  useEffect(() => {
    setOutputCompressionInput(
      params.output_compression == null ? '' : String(params.output_compression),
    )
  }, [params.output_compression])

  useEffect(() => {
    setNInput(agentAutoImageCount ? 'auto' : String(params.n))
  }, [agentAutoImageCount, params.n])

  useEffect(() => {
    const normalizedParams = normalizeParamsForSettings(params, effectiveSettings, { hasInputImages: inputImageCount > 0 })
    const patch = getChangedParams(params, normalizedParams)
    if (Object.keys(patch).length) {
      setParams(patch)
    }
  }, [effectiveSettings, inputImageCount, params, setParams])

  const commitOutputCompression = useCallback(() => {
    if (outputCompressionInput.trim() === '') {
      setOutputCompressionInput('')
      setParams({ output_compression: null })
      return
    }

    const nextValue = Number(outputCompressionInput)
    if (Number.isNaN(nextValue)) {
      setOutputCompressionInput(params.output_compression == null ? '' : String(params.output_compression))
      return
    }

    setOutputCompressionInput(String(nextValue))
    setParams({ output_compression: nextValue })
  }, [outputCompressionInput, params.output_compression, setParams])

  const commitN = useCallback(() => {
    nLimitHint.hide()
    if (agentAutoImageCount) {
      setNInput('auto')
      return
    }
    const nextValue = Number(nInput)
    const normalizedValue =
      nInput.trim() === '' ? DEFAULT_PARAMS.n : Number.isNaN(nextValue) ? params.n : nextValue
    const clampedValue = Math.min(outputImageLimit, Math.max(1, normalizedValue))
    setNInput(String(clampedValue))
    setParams({ n: clampedValue })
  }, [agentAutoImageCount, nInput, nLimitHint, outputImageLimit, params.n, setParams])

  const showNLimitHint = useCallback(() => {
    nLimitHint.show()
  }, [nLimitHint])

  const hideNLimitHint = useCallback(() => {
    nLimitHint.hide()
  }, [nLimitHint])

  const showAgentNHint = useCallback(() => {
    if (agentAutoImageCount) showNLimitHint()
  }, [agentAutoImageCount, showNLimitHint])

  const clearAgentNHintTouchTimer = useCallback(() => {
    nLimitHint.clearTimer()
  }, [nLimitHint])

  const startAgentNHintTouch = useCallback(() => {
    if (!agentAutoImageCount) return
    nLimitHint.startTouch()
  }, [agentAutoImageCount, nLimitHint])

  const handleNInputChange = useCallback((value: string) => {
    if (agentAutoImageCount) {
      setNInput('auto')
      return
    }
    setNInput(value)
    const nextValue = Number(value)
    if (!Number.isNaN(nextValue) && nextValue > outputImageLimit) {
      showNLimitHint()
    } else {
      hideNLimitHint()
    }
  }, [agentAutoImageCount, hideNLimitHint, outputImageLimit, showNLimitHint])

  const handleNLimitIncreaseAttempt = useCallback((preventDefault: () => void) => {
    if (agentAutoImageCount) {
      preventDefault()
      showNLimitHint()
      return
    }
    const currentValue = Number(nInput)
    const effectiveValue = Number.isNaN(currentValue) ? params.n : currentValue
    if (!nInputFocused || effectiveValue < outputImageLimit) return

    preventDefault()
    showNLimitHint()
  }, [agentAutoImageCount, nInput, nInputFocused, outputImageLimit, params.n, showNLimitHint])

  return {
    agentAutoImageCount,
    clearAgentNHintTouchTimer,
    commitN,
    commitOutputCompression,
    compressionDisabled,
    compressionHint,
    displaySize,
    handleNInputChange,
    handleNLimitIncreaseAttempt,
    hideNLimitHint,
    isFalProvider,
    isFalTextToImage,
    moderationDisabled,
    moderationHint,
    nInput,
    nLimitHint,
    nLimitHintText,
    outputCompressionInput,
    outputImageLimit,
    qualityHint,
    qualityOptions,
    setNInputFocused,
    setOutputCompressionInput,
    showAgentNHint,
    sizeHint,
    sizePickerCurrentSize,
    startAgentNHintTouch,
    streamConcurrentByN,
  }
}
