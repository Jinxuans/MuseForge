import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useStore, submitTask, submitAgentMessage, stopAgentResponse } from '../store'
import { getActiveApiProfile, normalizeSettings } from '../lib/apiProfiles'
import { createMaskPreviewDataUrl } from '../lib/canvasImage'
import { dismissAllTooltips } from '../lib/tooltipDismiss'
import Select from './Select'
import SizePickerModal from './SizePickerModal'
import { useIsMobile } from './input/InputBarParts'
import BatchSelectionToolbar, { useBatchSelectionToolbar } from './input/BatchSelectionToolbar'
import InputBarActions from './input/InputBarActions'
import InputImageDropOverlay from './input/InputImageDropOverlay'
import InputImageThumbs from './input/InputImageThumbs'
import PromptInputArea from './input/PromptInputArea'
import TaskParamPanel from './input/TaskParamPanel'
import { useAtImageMentions } from './input/useAtImageMentions'
import { useInputBarClearance, useMobileInputCollapse } from './input/useInputBarLayout'
import { useImageHintState } from './input/useImageHintState'
import { useInputImageDrag } from './input/useInputImageDrag'
import { useInputImageFiles } from './input/useInputImageFiles'
import { usePromptEditor } from './input/usePromptEditor'
import { useTaskParamControls } from './input/useTaskParamControls'


/** API 支持的最大参考图数量 */
const API_MAX_IMAGES = 16

export default function InputBar() {
  const prompt = useStore((s) => s.prompt)
  const appMode = useStore((s) => s.appMode)
  const setPrompt = useStore((s) => s.setPrompt)
  const inputImages = useStore((s) => s.inputImages)
  const addInputImage = useStore((s) => s.addInputImage)
  const replaceInputImage = useStore((s) => s.replaceInputImage)
  const removeInputImage = useStore((s) => s.removeInputImage)
  const clearInputImages = useStore((s) => s.clearInputImages)
  const params = useStore((s) => s.params)
  const setParams = useStore((s) => s.setParams)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const reusedTaskApiProfileId = useStore((s) => s.reusedTaskApiProfileId)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setLightboxImageId = useStore((s) => s.setLightboxImageId)
  const showToast = useStore((s) => s.showToast)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const tasks = useStore((s) => s.tasks)
  const agentConversations = useStore((s) => s.agentConversations)
  const activeAgentConversationId = useStore((s) => s.activeAgentConversationId)
  const batchSelection = useBatchSelectionToolbar()

  const maskDraft = useStore((s) => s.maskDraft)
  const clearMaskDraft = useStore((s) => s.clearMaskDraft)
  const setMaskEditorImageId = useStore((s) => s.setMaskEditorImageId)
  const moveInputImage = useStore((s) => s.moveInputImage)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const replaceFileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const imagesRef = useRef<HTMLDivElement>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [submitHover, setSubmitHover] = useState(false)
  const [attachHover, setAttachHover] = useState(false)
  const [showSizePicker, setShowSizePicker] = useState(false)
  const [showMobileUploadMenu, setShowMobileUploadMenu] = useState(false)
  const [maskPreviewUrl, setMaskPreviewUrl] = useState('')
  const resetMentionMenuRef = useRef<() => void>(() => {})
  const { handleRef, mobileCollapsed, toggleMobileCollapsed } = useMobileInputCollapse()
  const {
    imageHintId,
    setImageHintId,
    clearImageHintTimer,
    showImageHint,
    hideImageHint,
    hideLockedImageHint,
    showImageHintUntilRelease,
  } = useImageHintState()

  useInputBarClearance(cardRef)
  const isMobile = useIsMobile()

  const currentActiveProfile = useMemo(() => getActiveApiProfile(settings), [settings])
  const activeProfile = useMemo(() => (
    settings.reuseTaskApiProfileTemporarily && reusedTaskApiProfileId
      ? settings.profiles.find((profile) => profile.id === reusedTaskApiProfileId) ?? currentActiveProfile
      : currentActiveProfile
  ), [currentActiveProfile, reusedTaskApiProfileId, settings])
  const activeAgentConversation = appMode === 'agent'
    ? agentConversations.find((conversation) => conversation.id === activeAgentConversationId) ?? null
    : null
  const activeAgentIsRunning = Boolean(activeAgentConversation?.rounds.some((round) => round.status === 'running'))
  const effectiveSettings = useMemo(() => (
    activeProfile.id === currentActiveProfile.id
      ? settings
      : normalizeSettings({ ...settings, activeProfileId: activeProfile.id })
  ), [activeProfile.id, currentActiveProfile.id, settings])
  const hasSubmitApiConfig = Boolean(activeProfile.apiKey)
  const canSubmit = Boolean(prompt.trim() && hasSubmitApiConfig && !activeAgentIsRunning)
  const submitButtonAriaLabel = activeAgentIsRunning
    ? '停止生成'
    : hasSubmitApiConfig
    ? maskDraft ? '遮罩编辑' : '生成图像'
    : '请先配置 API'
  const submitTooltipText = activeAgentIsRunning ? '停止生成' : '尚未完成 API 配置，请在右上角设置中进行'
  const promptPlaceholder = '描述你想生成的图片，可输入 @ 来指定参考图...'
  const submitCurrentMode = useCallback(() => {
    if (appMode === 'agent') {
      void submitAgentMessage()
    } else {
      void submitTask()
    }
  }, [appMode])
  const stopActiveAgentResponse = useCallback(() => {
    stopAgentResponse(activeAgentConversationId)
  }, [activeAgentConversationId])
  const paramControls = useTaskParamControls({
    activeProfile,
    appMode,
    effectiveSettings,
    inputImageCount: inputImages.length,
    params,
    setParams,
    settingsCodexCli: settings.codexCli,
  })
  const atImageLimit = inputImages.length >= API_MAX_IMAGES
  const uploadImageTooltipText = atImageLimit ? `参考图数量已达上限（${API_MAX_IMAGES} 张），无法继续添加` : '上传图片'
  const maskTargetImage = maskDraft
    ? inputImages.find((img) => img.id === maskDraft.targetImageId) ?? null
    : null
  const referenceImages = maskTargetImage
    ? inputImages.filter((img) => img.id !== maskTargetImage.id)
    : inputImages
  const imageDrag = useInputImageDrag({
    hideImageHint,
    inputImageCount: inputImages.length,
    maskTargetImage,
    showImageHint,
  })
  const imageFiles = useInputImageFiles({
    addInputImage,
    inputImages,
    maxImages: API_MAX_IMAGES,
    replaceFileInputRef,
    replaceInputImage,
    setConfirmDialog,
    setIsDragging,
    setMaskEditorImageId,
    setSettings,
    showToast,
    referenceImageEditAction: settings.referenceImageEditAction,
  })
  const resetMentionMenu = useCallback(() => {
    resetMentionMenuRef.current()
  }, [])
  const {
    cursorPos,
    handleClearPrompt,
    handleInput,
    handlePromptCopy,
    handlePromptPaste,
    handleSelect,
    insertPromptTextAtSelection,
    isSingleLine,
    isUserInputRef,
    menuLeft,
    syncPromptFromContentEditable,
  } = usePromptEditor({
    imagesRef,
    inputImages,
    maskDraft,
    maskPreviewUrl,
    prompt,
    resetMentionMenu,
    setPrompt,
    textareaRef,
  })
  const atImageMentions = useAtImageMentions({
    activeAgentConversation,
    cursorPosition: cursorPos,
    inputImages,
    isUserInputRef,
    prompt,
    setPrompt,
    syncPromptFromContentEditable,
    tasks,
    textareaRef,
  })
  resetMentionMenuRef.current = atImageMentions.resetMentionMenu

  useEffect(() => {
    let cancelled = false
    if (!maskDraft || !maskTargetImage) {
      setMaskPreviewUrl('')
      return
    }

    createMaskPreviewDataUrl(maskTargetImage.dataUrl, maskDraft.maskDataUrl)
      .then((url) => {
        if (!cancelled) setMaskPreviewUrl(url)
      })
      .catch(() => {
        if (!cancelled) setMaskPreviewUrl('')
      })

    return () => {
      cancelled = true
    }
  }, [maskDraft, maskTargetImage?.id, maskTargetImage?.dataUrl])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (atImageMentions.handleAtImageKeyDown(e)) return

    // 阻止 contentEditable 默认换行
    if (e.key === 'Enter') {
      e.preventDefault()

      const isModifier = e.ctrlKey || e.metaKey

      if (settings.enterSubmit) {
        if (e.shiftKey) {
          insertPromptTextAtSelection('\n')
        } else if (!isModifier) {
          if (canSubmit) submitCurrentMode()
        }
      } else {
        if (isModifier) {
          if (canSubmit) submitCurrentMode()
        } else {
          insertPromptTextAtSelection('\n')
        }
      }
      return
    }
  }

  const selectClass = 'px-3 py-1.5 rounded-xl border border-gray-200/60 dark:border-white/[0.08] bg-white/50 dark:bg-white/[0.03] hover:bg-white dark:hover:bg-white/[0.06] text-xs transition-all duration-200 shadow-sm'

  const renderImageThumbs = () => (
    <InputImageThumbs
      inputImages={inputImages}
      imagesRef={imagesRef}
      maskTargetImage={maskTargetImage}
      maskTargetImageId={maskDraft?.targetImageId ?? null}
      maskPreviewUrl={maskPreviewUrl}
      imageHintId={imageHintId}
      isMobile={isMobile}
      textareaRef={textareaRef}
      {...imageDrag}
      setImageHintId={setImageHintId}
      showImageHintUntilRelease={showImageHintUntilRelease}
      hideImageHint={hideImageHint}
      hideLockedImageHint={hideLockedImageHint}
      clearImageHintTimer={clearImageHintTimer}
      moveInputImage={moveInputImage}
      removeInputImage={removeInputImage}
      onClearAll={() =>
        setConfirmDialog({
          title: maskTargetImage ? '清空全部输入图' : '清空参考图',
          message: maskTargetImage
            ? `确定要清空遮罩主图、${referenceImages.length} 张参考图和当前遮罩吗？`
            : `确定要清空全部 ${inputImages.length} 张参考图吗？`,
          action: () => clearInputImages(),
        })
      }
      onEditReferenceImage={imageFiles.handleEditReferenceImage}
      onInsertImageMention={atImageMentions.insertInputImageMention}
      onOpenMaskEditor={setMaskEditorImageId}
      onOpenLightbox={setLightboxImageId}
      showToast={showToast}
    />
  )

  const renderParams = (cols: string) => (
    <TaskParamPanel
      cols={cols}
      params={params}
      settingsCodexCli={settings.codexCli}
      isFalProvider={paramControls.isFalProvider}
      isFalTextToImage={paramControls.isFalTextToImage}
      displaySize={paramControls.displaySize}
      qualityOptions={paramControls.qualityOptions}
      selectClass={selectClass}
      outputCompressionInput={paramControls.outputCompressionInput}
      compressionDisabled={paramControls.compressionDisabled}
      moderationDisabled={paramControls.moderationDisabled}
      agentAutoImageCount={paramControls.agentAutoImageCount}
      outputImageLimit={paramControls.outputImageLimit}
      nInput={paramControls.nInput}
      nLimitHintText={paramControls.nLimitHintText}
      streamConcurrentByN={paramControls.streamConcurrentByN}
      sizeHint={paramControls.sizeHint}
      qualityHint={paramControls.qualityHint}
      compressionHint={paramControls.compressionHint}
      moderationHint={paramControls.moderationHint}
      nLimitHint={paramControls.nLimitHint}
      setShowSizePicker={setShowSizePicker}
      dismissTooltips={dismissAllTooltips}
      setParams={setParams}
      setOutputCompressionInput={paramControls.setOutputCompressionInput}
      commitOutputCompression={paramControls.commitOutputCompression}
      showAgentNHint={paramControls.showAgentNHint}
      hideNLimitHint={paramControls.hideNLimitHint}
      startAgentNHintTouch={paramControls.startAgentNHintTouch}
      clearAgentNHintTouchTimer={paramControls.clearAgentNHintTouchTimer}
      handleNInputChange={paramControls.handleNInputChange}
      setNInputFocused={paramControls.setNInputFocused}
      commitN={paramControls.commitN}
      handleNLimitIncreaseAttempt={paramControls.handleNLimitIncreaseAttempt}
    />
  )

  return (
    <>
      <InputImageDropOverlay
        isLimitReached={atImageLimit}
        maxImages={API_MAX_IMAGES}
        visible={isDragging}
      />

      {showSizePicker && (
        <SizePickerModal
          currentSize={paramControls.sizePickerCurrentSize}
          onSelect={(size) => setParams({ size })}
          onClose={() => setShowSizePicker(false)}
          allowAuto={!paramControls.isFalTextToImage}
        />
      )}

      <div data-input-bar className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-30 w-full max-w-4xl px-3 sm:px-4 transition-all duration-300">
        <BatchSelectionToolbar
          selectedCount={batchSelection.selectedCount}
          filteredTaskCount={batchSelection.filteredTaskCount}
          allSelected={batchSelection.allSelected}
          allSelectedFavorite={batchSelection.allSelectedFavorite}
          taskView={batchSelection.taskView}
          onClearSelection={batchSelection.clearSelection}
          onSelectAllToggle={batchSelection.handleSelectAllToggle}
          onToggleFavorite={batchSelection.handleToggleFavorite}
          onRestoreSelected={batchSelection.handleRestoreSelected}
          onMoveSelectedToCategory={batchSelection.handleMoveSelectedToCategory}
          onDownloadSelected={batchSelection.handleDownloadSelected}
          onDeleteSelected={batchSelection.handleDeleteSelected}
        />
        <div ref={cardRef} className="bg-white/70 dark:bg-gray-900/70 backdrop-blur-2xl border border-white/50 dark:border-white/[0.08] shadow-[0_8px_30px_rgb(0,0,0,0.08)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] rounded-2xl sm:rounded-3xl p-3 sm:p-4 ring-1 ring-black/5 dark:ring-white/10">
          {/* 移动端拖动条 */}
          <div
            ref={handleRef}
            className="sm:hidden flex justify-center pt-0.5 pb-2 -mt-1 cursor-pointer touch-none"
            onClick={toggleMobileCollapsed}
          >
            <div className={`w-10 h-1 rounded-full bg-gray-300 dark:bg-white/[0.06] transition-transform duration-200 ${mobileCollapsed ? 'scale-x-75' : ''}`} />
          </div>

          {/* 输入图片行（移动端可折叠） */}
          {inputImages.length > 0 && (
            isMobile ? (
              <>
                <div className={`collapse-section${mobileCollapsed ? ' collapsed' : ''}`}>
                  <div className="collapse-inner">
                    {renderImageThumbs()}
                  </div>
                </div>
                {mobileCollapsed && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 mb-2 ml-1">
                    {maskDraft ? `1 张遮罩主图 · ${referenceImages.length} 张参考图` : `${inputImages.length} 张参考图`}
                  </div>
                )}
              </>
            ) : (
              renderImageThumbs()
            )
          )}

          {/* 输入框 */}
          <PromptInputArea
            activeAtImageIndex={atImageMentions.atImageMenuIndex}
            atImageOptions={atImageMentions.atImageOptions}
            isSingleLine={isSingleLine}
            menuLeft={menuLeft}
            onActiveAtImageIndexChange={atImageMentions.setAtImageMenuIndex}
            onAtImageSelect={atImageMentions.selectAtImageOption}
            onClearPrompt={handleClearPrompt}
            onCopy={handlePromptCopy}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePromptPaste}
            onSelect={handleSelect}
            placeholder={promptPlaceholder}
            prompt={prompt}
            showAtImageMenu={atImageMentions.showAtImageMenu}
            textareaRef={textareaRef}
          />

          <InputBarActions
            desktopParams={renderParams('grid-cols-6')}
            mobileParams={renderParams('grid-cols-2')}
            mobileCollapsed={mobileCollapsed}
            attachHover={attachHover}
            submitHover={submitHover}
            uploadImageTooltipText={uploadImageTooltipText}
            submitTooltipText={submitTooltipText}
            submitButtonAriaLabel={submitButtonAriaLabel}
            atImageLimit={atImageLimit}
            showMobileUploadMenu={showMobileUploadMenu}
            activeAgentIsRunning={activeAgentIsRunning}
            hasSubmitApiConfig={hasSubmitApiConfig}
            canSubmit={canSubmit}
            hasMaskDraft={Boolean(maskDraft)}
            onAttachHoverChange={setAttachHover}
            onSubmitHoverChange={setSubmitHover}
            onDesktopUpload={() => !atImageLimit && fileInputRef.current?.click()}
            onToggleMobileUploadMenu={() => {
              if (!atImageLimit) setShowMobileUploadMenu(!showMobileUploadMenu)
            }}
            onCloseMobileUploadMenu={() => setShowMobileUploadMenu(false)}
            onCameraUpload={() => {
              setShowMobileUploadMenu(false)
              cameraInputRef.current?.click()
            }}
            onFileUpload={() => {
              setShowMobileUploadMenu(false)
              fileInputRef.current?.click()
            }}
            onSubmit={() => activeAgentIsRunning ? stopActiveAgentResponse() : hasSubmitApiConfig ? submitCurrentMode() : setShowSettings(true)}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={imageFiles.handleFileUpload}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={imageFiles.handleFileUpload}
          />
          <input
            ref={replaceFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={imageFiles.handleReplaceFileUpload}
          />
        </div>
      </div>
    </>
  )
}
