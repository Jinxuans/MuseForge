import { useEffect, useMemo, useState, useRef, useCallback, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react'
import type { AgentMessage, AgentRound, TaskRecord } from '../types'
import { deleteAgentRoundFromConversation, ensureImageCached, getActiveAgentRounds, getAgentBranchLeafId, getAgentSiblingRounds, remapAgentRoundMentionsForPathChange, removeMultipleTasks, reuseConfig, useStore } from '../store'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import { ArrowDownIcon } from '../shared/ui/icons'
import AgentConversationSidebar from './agent/AgentConversationSidebar'
import AgentMessageList from './agent/AgentMessageList'
import AgentMobileHeader, { AgentMobilePullIndicator } from './agent/AgentMobileHeader'
import { getConversationSearchText } from './agent/agentAssistantBlocks'

const MOBILE_HEADER_PULL_THRESHOLD = 24
const MOBILE_HEADER_PULL_MAX_OFFSET = 48
const MOBILE_HEADER_EDGE_GUARD = 24

function getPageScrollTop() {
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0
}

export default function AgentWorkspace() {
  const conversations = useStore((s) => s.agentConversations)
  const conversationsLoaded = useStore((s) => s.agentConversationsLoaded)
  const activeConversationId = useStore((s) => s.activeAgentConversationId)
  const createConversation = useStore((s) => s.createAgentConversation)
  const setActiveConversationId = useStore((s) => s.setActiveAgentConversationId)
  const renameConversation = useStore((s) => s.renameAgentConversation)
  const deleteConversation = useStore((s) => s.deleteAgentConversation)
  const sidebarCollapsed = useStore((s) => s.agentSidebarCollapsed)
  const setSidebarCollapsed = useStore((s) => s.setAgentSidebarCollapsed)
  const agentMobileHeaderVisible = useStore((s) => s.agentMobileHeaderVisible)
  const setAgentMobileHeaderVisible = useStore((s) => s.setAgentMobileHeaderVisible)
  const appMode = useStore((s) => s.appMode)
  const tasks = useStore((s) => s.tasks)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setPrompt = useStore((s) => s.setPrompt)
  const setInputImages = useStore((s) => s.setInputImages)
  const setMaskDraft = useStore((s) => s.setMaskDraft)
  const clearMaskDraft = useStore((s) => s.clearMaskDraft)
  const setAppMode = useStore((s) => s.setAppMode)
  const agentScrollToBottomAfterSubmit = useStore((s) => s.settings.agentScrollToBottomAfterSubmit)
  const agentEditingRoundId = useStore((s) => s.agentEditingRoundId)
  const agentEditingConversationId = useStore((s) => s.agentEditingConversationId)
  const setAgentEditingConversationId = useStore((s) => s.setAgentEditingConversationId)
  const setAgentEditingRoundId = useStore((s) => s.setAgentEditingRoundId)
  const setActiveAgentRoundId = useStore((s) => s.setActiveAgentRoundId)
  const showToast = useStore((s) => s.showToast)
  const agentGeneratingTitleIds = useStore((s) => s.agentGeneratingTitleIds)
  const conversation = conversations.find((item) => item.id === activeConversationId) ?? null
  const [, setSelectedRoundId] = useState<string | null>(null)
  const [editingConversationTitle, setEditingConversationTitle] = useState('')

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomSentinelRef = useRef<HTMLDivElement>(null)
  const messageRefs = useRef(new Map<string, HTMLElement>())
  const [scrollTargetRoundId, setScrollTargetRoundId] = useState<string | null>(null)
  const [pullDownOffset, setPullDownOffset] = useState(0)
  const [mobileTopBarVisible, setMobileTopBarVisible] = useState(true)
  const [conversationSearchQuery, setConversationSearchQuery] = useState('')
  const [conversationActionsId, setConversationActionsId] = useState<string | null>(null)
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(true)
  const touchStartY = useRef(-1)
  const conversationLongPressTimer = useRef<number | null>(null)
  const autoScrollStateRef = useRef<{ conversationId: string | null; lastUserMessageSignature: string | null }>({ conversationId: null, lastUserMessageSignature: null })
  const errorCopyPointerDownRef = useRef<{ x: number; y: number } | null>(null)

  const updateIsScrolledToBottom = useCallback(() => {
    const sentinel = bottomSentinelRef.current
    if (appMode !== 'agent' || !sentinel) {
      setIsScrolledToBottom(true)
      return
    }

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight
    setIsScrolledToBottom(sentinel.getBoundingClientRect().top <= viewportHeight + 24)
  }, [appMode])

  const scrollToAgentBottom = useCallback(() => {
    const scrollingElement = document.scrollingElement ?? document.documentElement
    window.scrollTo({ top: scrollingElement.scrollHeight, behavior: 'smooth' })
  }, [])

  const handleTouchStart = (e: ReactTouchEvent) => {
    const touchY = e.touches[0]?.clientY ?? -1
    if (
      appMode !== 'agent' ||
      agentMobileHeaderVisible ||
      getPageScrollTop() > 0 ||
      touchY < MOBILE_HEADER_EDGE_GUARD
    ) {
      touchStartY.current = -1
      setPullDownOffset(0)
      return
    }

    touchStartY.current = touchY
  }

  const handleHeaderTouchStart = (e: ReactTouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }
   
  const handleTouchMove = (e: ReactTouchEvent) => {
    if (touchStartY.current <= 0 || agentMobileHeaderVisible) return

    const diff = e.touches[0].clientY - touchStartY.current
    if (diff <= 0) {
      setPullDownOffset(0)
      return
    }

    if (e.cancelable) e.preventDefault()
    if (diff >= MOBILE_HEADER_PULL_THRESHOLD) {
      setAgentMobileHeaderVisible(true)
      setPullDownOffset(0)
      touchStartY.current = -1
      return
    }

    setPullDownOffset(Math.min(diff, MOBILE_HEADER_PULL_MAX_OFFSET))
  }

  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartY.current > 0 && !agentMobileHeaderVisible) {
      const touchEndY = e.changedTouches[0].clientY
      if (touchEndY - touchStartY.current >= MOBILE_HEADER_PULL_THRESHOLD) setAgentMobileHeaderVisible(true)
    }
    setPullDownOffset(0)
    touchStartY.current = -1
  }

  useEffect(() => {
    if (sidebarCollapsed) {
      setAgentEditingConversationId(null)
    }
  }, [sidebarCollapsed, setAgentEditingConversationId])

  useEffect(() => {
    if (appMode !== 'agent') return

    document.documentElement.classList.add('agent-no-pull-refresh')
    return () => document.documentElement.classList.remove('agent-no-pull-refresh')
  }, [appMode])

  useEffect(() => {
    if (!agentMobileHeaderVisible || appMode !== 'agent') return

    const handleInteract = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('header[data-no-drag-select]')) return
      setAgentMobileHeaderVisible(false)
    }

    document.addEventListener('mousedown', handleInteract, { capture: true })
    document.addEventListener('touchstart', handleInteract, { capture: true })

    return () => {
      document.removeEventListener('mousedown', handleInteract, { capture: true })
      document.removeEventListener('touchstart', handleInteract, { capture: true })
    }
  }, [agentMobileHeaderVisible, appMode, setAgentMobileHeaderVisible])

  useEffect(() => {
    if (appMode !== 'agent') return

    setMobileTopBarVisible(true)
    let lastScrollY = window.scrollY
    let ticking = false

    const handleScroll = () => {
      if (ticking) return

      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY
        if (currentScrollY < 20) {
          setMobileTopBarVisible(true)
        } else if (currentScrollY > lastScrollY + 10) {
          setMobileTopBarVisible(false)
        } else if (currentScrollY < lastScrollY - 10) {
          setMobileTopBarVisible(true)
        }

        updateIsScrolledToBottom()

        lastScrollY = currentScrollY
        ticking = false
      })
      ticking = true
    }

    const initialFrame = window.requestAnimationFrame(updateIsScrolledToBottom)
    const visualViewport = window.visualViewport
    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', updateIsScrolledToBottom)
    visualViewport?.addEventListener('resize', updateIsScrolledToBottom)

    return () => {
      window.cancelAnimationFrame(initialFrame)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', updateIsScrolledToBottom)
      visualViewport?.removeEventListener('resize', updateIsScrolledToBottom)
    }
  }, [appMode, updateIsScrolledToBottom])

  useEffect(() => {
    if (appMode !== 'agent') return
    if (!conversationsLoaded) return
    
    if (conversations.length === 0) {
      createConversation()
    } else if (!conversation) {
      const latest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0]
      if (latest && latest.messages.length === 0) {
        setActiveConversationId(latest.id)
      } else {
        createConversation()
      }
    }
  }, [appMode, conversationsLoaded, conversations, conversation, createConversation, setActiveConversationId])

  const sortedConversations = useMemo(
    () => [...conversations].sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations],
  )

  const filteredConversations = useMemo(() => {
    const query = conversationSearchQuery.trim().toLocaleLowerCase()
    if (!query) return sortedConversations
    return sortedConversations.filter((item) => getConversationSearchText(item).includes(query))
  }, [conversationSearchQuery, sortedConversations])

  const activeRounds = useMemo(
    () => conversation ? getActiveAgentRounds(conversation) : [],
    [conversation],
  )

  const activeMessages = useMemo(() => {
    if (!conversation) return []
    const messages: AgentMessage[] = []
    for (const round of activeRounds) {
      const userMessage = conversation.messages.find((message) => message.id === round.userMessageId)
      if (userMessage) messages.push(userMessage)
      const assistantMessage = round.assistantMessageId
        ? conversation.messages.find((message) => message.id === round.assistantMessageId)
        : conversation.messages.find((message) => message.roundId === round.id && message.role === 'assistant')
      if (assistantMessage) messages.push(assistantMessage)
    }
    return messages
  }, [activeRounds, conversation])

  useEffect(() => {
    const conversationId = conversation?.id ?? null
    const lastMessage = activeMessages[activeMessages.length - 1] ?? null
    const lastUserMessageSignature = lastMessage?.role === 'user'
      ? `${lastMessage.id}:${lastMessage.createdAt}:${lastMessage.content}`
      : null
    const previous = autoScrollStateRef.current
    const shouldScroll = appMode === 'agent' &&
      agentScrollToBottomAfterSubmit &&
      previous.conversationId === conversationId &&
      lastMessage?.role === 'user' &&
      lastUserMessageSignature != null &&
      previous.lastUserMessageSignature !== lastUserMessageSignature

    autoScrollStateRef.current = { conversationId, lastUserMessageSignature }
    if (!shouldScroll) return

    const frame = window.requestAnimationFrame(() => {
      scrollToAgentBottom()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeMessages, agentScrollToBottomAfterSubmit, appMode, conversation?.id, scrollToAgentBottom])

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateIsScrolledToBottom)
    return () => window.cancelAnimationFrame(frame)
  }, [activeMessages, activeRounds, updateIsScrolledToBottom])

  useEffect(() => {
    if (!scrollTargetRoundId) return
    const id = window.requestAnimationFrame(() => {
      messageRefs.current.get(scrollTargetRoundId)?.scrollIntoView({ block: 'center' })
      setScrollTargetRoundId(null)
    })
    return () => window.cancelAnimationFrame(id)
  }, [activeMessages, scrollTargetRoundId])

  const handleSwitchBranch = (round: AgentRound, direction: -1 | 1) => {
    if (!conversation) return
    const siblings = getAgentSiblingRounds(conversation, round)
    if (siblings.length <= 1) return
    const currentIndex = siblings.findIndex((item) => item.id === round.id)
    const nextRound = siblings[(currentIndex + direction + siblings.length) % siblings.length]
    const nextLeafId = getAgentBranchLeafId(conversation, nextRound.id)
    setActiveAgentRoundId(conversation.id, nextLeafId)
    setAgentEditingRoundId(null)
    setScrollTargetRoundId(nextRound.id)
  }

  const handleDeleteConversation = (id: string) => {
    const targetConversation = conversations.find((item) => item.id === id) ?? null
    const roundIds = new Set(targetConversation?.rounds.map((round) => round.id) ?? [])
    const roundTaskIds = targetConversation?.rounds.flatMap((round) => round.outputTaskIds) ?? []
    const relatedTasks = tasks.filter((task) =>
      task.agentConversationId === id || Boolean(task.agentRoundId && roundIds.has(task.agentRoundId)),
    )
    const existingTaskIds = new Set(tasks.map((task) => task.id))
    const relatedTaskIds = Array.from(new Set([...roundTaskIds, ...relatedTasks.map((task) => task.id)]))
      .filter((taskId) => existingTaskIds.has(taskId))
    const relatedTaskIdSet = new Set(relatedTaskIds)
    const generatedImageCount = new Set(
      tasks
        .filter((task) => relatedTaskIdSet.has(task.id))
        .flatMap((task) => task.outputImages || []),
    ).size

    setConfirmDialog({
      title: '删除对话',
      message: '确定要删除这个 Agent 对话吗？',
      checkbox: generatedImageCount > 0
        ? {
            label: `同时删除对话中生成的图片（${generatedImageCount} 张）`,
            tone: 'danger',
          }
        : undefined,
      action: async (deleteGeneratedImages = false) => {
        deleteConversation(id)
        if (deleteGeneratedImages && relatedTaskIds.length > 0) await removeMultipleTasks(relatedTaskIds)
      },
    })
  }

  const startRenameConversation = (e: ReactMouseEvent | ReactTouchEvent, id: string, currentTitle: string) => {
    e.stopPropagation()
    if (agentGeneratingTitleIds[id]) {
      showToast('标题生成中，暂不能修改标题', 'info')
      return
    }
    setAgentEditingConversationId(id)
    setEditingConversationTitle(currentTitle)
  }

  const confirmRenameConversation = () => {
    if (agentEditingConversationId && editingConversationTitle.trim() && !agentGeneratingTitleIds[agentEditingConversationId]) {
      renameConversation(agentEditingConversationId, editingConversationTitle.trim())
    }
    setAgentEditingConversationId(null)
  }

  const handleRenameKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      confirmRenameConversation()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setAgentEditingConversationId(null)
    }
  }

  // Effect to sync title when editing id is set from outside (e.g. Header)
  useEffect(() => {
    if (agentEditingConversationId) {
      const convo = conversations.find(c => c.id === agentEditingConversationId)
      if (convo) {
        setEditingConversationTitle(convo.title)
      }
    }
  }, [agentEditingConversationId, conversations])

  const clearConversationLongPressTimer = () => {
    if (conversationLongPressTimer.current == null) return
    window.clearTimeout(conversationLongPressTimer.current)
    conversationLongPressTimer.current = null
  }

  const handleConversationPointerDown = (id: string, e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return
    clearConversationLongPressTimer()
    conversationLongPressTimer.current = window.setTimeout(() => {
      setConversationActionsId(id)
      conversationLongPressTimer.current = null
    }, 450)
  }

  const handleConversationSelect = (id: string) => {
    setActiveConversationId(id)
    if (conversationActionsId && conversationActionsId !== id) setConversationActionsId(null)
  }

  useEffect(() => {
    if (!conversationActionsId) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('[data-agent-conversation-item]')) return
      setConversationActionsId(null)
    }

    document.addEventListener('pointerdown', handlePointerDown, { capture: true })
    return () => document.removeEventListener('pointerdown', handlePointerDown, { capture: true })
  }, [conversationActionsId])

  const handleDeleteMessage = (message: AgentMessage, round: AgentRound) => {
    const isUserMessage = message.role === 'user'
    setConfirmDialog({
      title: isUserMessage ? '删除轮次' : '删除消息',
      message: isUserMessage
        ? '确定要删除这轮记录吗？这会删除这条消息和它的输出，后续消息会被保留。'
        : '确定要删除这条消息吗？关联的图片任务不会从画廊中删除。',
      action: async () => {
        if (isUserMessage) {
          if (round.outputTaskIds.length > 0) await removeMultipleTasks(round.outputTaskIds)

          useStore.setState((state) => {
            const targetConversationId = conversation?.id
            let oldActivePath: AgentRound[] = []
            let newActivePath: AgentRound[] = []
            const agentConversations = state.agentConversations.map((item) => {
              if (item.id !== targetConversationId) return item
              oldActivePath = getActiveAgentRounds(item)
              const nextConversation = deleteAgentRoundFromConversation(item, round.id)
              newActivePath = getActiveAgentRounds(nextConversation)
              return nextConversation
            })
            const draft = targetConversationId ? state.agentInputDrafts[targetConversationId] : null
            const remappedDraft = draft
              ? { ...draft, prompt: remapAgentRoundMentionsForPathChange(draft.prompt, oldActivePath, newActivePath) }
              : null
            const agentInputDrafts = targetConversationId && remappedDraft
              ? { ...state.agentInputDrafts, [targetConversationId]: remappedDraft }
              : state.agentInputDrafts
            const shouldRemapVisibleInput = targetConversationId && state.activeAgentConversationId === targetConversationId && state.appMode === 'agent'
            return {
              agentConversations,
              agentInputDrafts,
              ...(shouldRemapVisibleInput ? { prompt: remapAgentRoundMentionsForPathChange(state.prompt, oldActivePath, newActivePath) } : {}),
              agentEditingRoundId: state.agentEditingRoundId === round.id ? null : state.agentEditingRoundId,
            }
          })
          return
        }

        useStore.setState((state) => ({
          agentConversations: state.agentConversations.map((item) =>
            item.id === conversation?.id
              ? {
                  ...item,
                  updatedAt: Date.now(),
                  rounds: item.rounds.map((candidate) =>
                    candidate.id === round.id && candidate.assistantMessageId === message.id
                      ? { ...candidate, assistantMessageId: undefined }
                      : candidate,
                  ),
                  messages: item.messages.filter((candidate) => candidate.id !== message.id),
                }
              : item,
          ),
          agentEditingRoundId: state.agentEditingRoundId,
        }))
      },
    })
  }

  const handleReuse = (task: TaskRecord) => {
    setConfirmDialog({
      title: '切换到画廊模式？',
      message: '复用参数会应用到画廊输入区。切换到画廊模式后，当前 Agent 对话仍会保留。',
      confirmText: '切换并复用',
      cancelText: '取消',
      action: () => {
        setAppMode('gallery')
        void reuseConfig(task)
      },
    })
  }

  const handleEditRoundMessage = async (round: AgentRound, content: string) => {
    setAgentEditingRoundId(round.id)
    clearMaskDraft()

    const inputImages = await Promise.all(
      round.inputImageIds.map(async (id) => ({
        id,
        dataUrl: await ensureImageCached(id) || '',
      })),
    )
    setInputImages(inputImages)
    const maskTargetImageId = round.maskTargetImageId ?? (round.maskImageId ? round.inputImageIds[0] : null)
    if (maskTargetImageId && round.maskImageId && inputImages.some((img) => img.id === maskTargetImageId)) {
      const maskDataUrl = await ensureImageCached(round.maskImageId)
      if (maskDataUrl) {
        setMaskDraft({
          targetImageId: maskTargetImageId,
          maskDataUrl,
          updatedAt: Date.now(),
        })
      }
    }
    setPrompt(content)
  }

  const handleCopyMessage = async (content: string, successMessage = '提示词已复制', failureMessage = '复制提示词失败') => {
    try {
      await copyTextToClipboard(content)
      showToast(successMessage, 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage(failureMessage, err), 'error')
    }
  }

  const handleErrorCopyPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    errorCopyPointerDownRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleErrorCopyClick = (e: ReactMouseEvent<HTMLDivElement>, content: string) => {
    e.stopPropagation()

    const pointerDown = errorCopyPointerDownRef.current
    errorCopyPointerDownRef.current = null
    if (pointerDown && Math.hypot(e.clientX - pointerDown.x, e.clientY - pointerDown.y) > 4) return

    const selection = window.getSelection()
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      const target = e.currentTarget
      if ((selection.anchorNode && target.contains(selection.anchorNode)) || (selection.focusNode && target.contains(selection.focusNode))) return
    }

    void handleCopyMessage(content, '完整报错已复制', '复制完整报错失败')
  }

  return (
    <main 
      data-agent-workspace 
      className="safe-area-x mx-auto flex min-h-[calc(100vh-100px)] flex-col lg:flex-row max-w-7xl lg:gap-3 px-3 lg:px-0 relative overflow-visible transition-all duration-300"
    >
      {!agentMobileHeaderVisible && (
        <AgentMobilePullIndicator offset={pullDownOffset} maxOffset={MOBILE_HEADER_PULL_MAX_OFFSET} />
      )}

      <AgentConversationSidebar
        collapsed={sidebarCollapsed}
        activeConversationId={activeConversationId}
        conversations={filteredConversations}
        searchQuery={conversationSearchQuery}
        editingConversationId={agentEditingConversationId}
        editingConversationTitle={editingConversationTitle}
        generatingTitleIds={agentGeneratingTitleIds}
        conversationActionsId={conversationActionsId}
        onCollapsedChange={setSidebarCollapsed}
        onCreateConversation={createConversation}
        onSearchQueryChange={setConversationSearchQuery}
        onEditingConversationTitleChange={setEditingConversationTitle}
        onConversationPointerDown={handleConversationPointerDown}
        onClearConversationLongPressTimer={clearConversationLongPressTimer}
        onConversationSelect={handleConversationSelect}
        onRenameKeyDown={handleRenameKeyDown}
        onConfirmRenameConversation={confirmRenameConversation}
        onStartRenameConversation={startRenameConversation}
        onDeleteConversation={handleDeleteConversation}
      />

      {/* Center Chat Area */}
      <section className="min-w-0 flex-1 flex flex-col relative">
        <AgentMobileHeader
          visible={mobileTopBarVisible}
          title={conversation?.title || 'Agent'}
          onOpenSidebar={() => setSidebarCollapsed(false)}
          onEditTitle={() => {
            setSidebarCollapsed(false)
            if (conversation) {
              useStore.getState().setAgentEditingConversationId(conversation.id)
            }
          }}
          onCreateConversation={createConversation}
          onTouchStart={handleHeaderTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />

        <AgentMessageList
          scrollContainerRef={scrollContainerRef}
          bottomSentinelRef={bottomSentinelRef}
          conversation={conversation}
          activeMessages={activeMessages}
          activeRounds={activeRounds}
          tasks={tasks}
          agentEditingRoundId={agentEditingRoundId}
          onCreateConversation={createConversation}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onRegisterUserMessageNode={(roundId, node) => {
            if (node) messageRefs.current.set(roundId, node)
            else messageRefs.current.delete(roundId)
          }}
          onSelectRound={setSelectedRoundId}
          onCopyMessage={(content, successMessage, failureMessage) => {
            void handleCopyMessage(content, successMessage, failureMessage)
          }}
          onSwitchBranch={handleSwitchBranch}
          onCancelEditing={() => {
            setPrompt('')
            setInputImages([])
            clearMaskDraft()
            setAgentEditingRoundId(null)
          }}
          onEditRoundMessage={handleEditRoundMessage}
          onDeleteMessage={handleDeleteMessage}
          onReuseTask={handleReuse}
          onOpenTaskDetail={setDetailTaskId}
          onErrorCopyPointerDown={handleErrorCopyPointerDown}
          onErrorCopyClick={handleErrorCopyClick}
        />

        <button
          onClick={scrollToAgentBottom}
          className={`fixed bottom-[calc(var(--input-bar-clearance,12rem)+1.5rem)] left-1/2 -translate-x-1/2 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 backdrop-blur shadow-[0_2px_12px_rgba(0,0,0,0.1)] border border-gray-200/50 text-gray-500 transition-all duration-300 hover:bg-gray-50 hover:text-gray-800 dark:border-white/[0.08] dark:bg-gray-800/90 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 ${
            !isScrolledToBottom && activeMessages.length > 0 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 pointer-events-none'
          }`}
          aria-label="滚动到底部"
        >
          <ArrowDownIcon className="h-5 w-5" />
        </button>
      </section>
    </main>
  )
}
