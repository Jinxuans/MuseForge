import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import type { AgentConversation, AgentMessage, AgentRound, TaskRecord } from '../../types'
import { editOutputs, getAgentSiblingRounds, regenerateAgentAssistantMessage, removeTask, updateTaskInStore, useStore } from '../../store'
import { getPromptMentionParts } from '../../lib/promptImageMentions'
import { downloadImageIds } from '../../lib/downloadImages'
import { CloseIcon, CopyIcon, DownloadIcon, EditIcon, FavoriteIcon, RefreshIcon, ChevronLeftIcon, ChevronRightIcon, TrashIcon } from '../../shared/ui/icons'
import MarkdownRenderer from '../MarkdownRenderer'
import TaskCard from '../TaskCard'
import { AgentActionButton, AgentWebSearchInlineStatus, AgentWebSearchStatusLines, ChatImageThumb } from './AgentMessageParts'
import {
  AgentStreamingCursor,
  getAgentAssistantBlocks,
  getAgentAssistantCopyContent,
  getRoundTasks,
  getRoundTaskSlots,
} from './agentAssistantBlocks'

type AgentChatMessageItemProps = {
  conversation: AgentConversation
  message: AgentMessage
  round?: AgentRound
  tasks: TaskRecord[]
  agentEditingRoundId: string | null
  onRegisterUserMessageNode: (roundId: string, node: HTMLElement | null) => void
  onSelectRound: (roundId: string) => void
  onCopyMessage: (content: string, successMessage?: string, failureMessage?: string) => void
  onSwitchBranch: (round: AgentRound, direction: -1 | 1) => void
  onCancelEditing: () => void
  onEditRoundMessage: (round: AgentRound, content: string) => void | Promise<void>
  onDeleteMessage: (message: AgentMessage, round: AgentRound) => void
  onReuseTask: (task: TaskRecord) => void
  onOpenTaskDetail: (taskId: string) => void
  onErrorCopyPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onErrorCopyClick: (event: ReactMouseEvent<HTMLDivElement>, content: string) => void
}

function AgentErrorMessage({
  content,
  onPointerDown,
  onClick,
}: {
  content: string
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onClick: (event: ReactMouseEvent<HTMLDivElement>, content: string) => void
}) {
  const normalized = content.replace(/^请求失败：/, '')
  const [mainErr, ...hints] = normalized.split('\n提示：')

  return (
    <div
      data-selectable-text
      className="-m-2 flex cursor-copy select-text flex-col rounded-xl p-2 transition-colors hover:bg-red-50/60 dark:hover:bg-red-500/5"
      title="点击复制完整报错"
      onPointerDown={onPointerDown}
      onClick={(event) => onClick(event, content)}
    >
      <div className="flex items-start gap-2 text-red-500 dark:text-red-400">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="mt-[1.5px] h-[18px] w-[18px] flex-shrink-0">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <div className="whitespace-pre-wrap break-words text-[14px] font-medium leading-relaxed">
          {mainErr}
        </div>
      </div>
      {hints.length > 0 && (
        <div className="mt-1.5 whitespace-pre-wrap break-words pl-[26px] text-[13px] leading-relaxed text-gray-500 opacity-90 dark:text-gray-400">
          <span className="font-medium">提示：</span>{hints.join('\n提示：')}
        </div>
      )}
    </div>
  )
}

export default function AgentChatMessageItem({
  conversation,
  message,
  round,
  tasks,
  agentEditingRoundId,
  onRegisterUserMessageNode,
  onSelectRound,
  onCopyMessage,
  onSwitchBranch,
  onCancelEditing,
  onEditRoundMessage,
  onDeleteMessage,
  onReuseTask,
  onOpenTaskDetail,
  onErrorCopyPointerDown,
  onErrorCopyClick,
}: AgentChatMessageItemProps) {
  const isAssistant = message.role === 'assistant'
  const isStreamingAssistant = isAssistant && round?.status === 'running'
  const isEditing = !isAssistant && round?.id === agentEditingRoundId
  const siblingRounds = !isAssistant && round ? getAgentSiblingRounds(conversation, round) : []
  const siblingIndex = round ? siblingRounds.findIndex((item) => item.id === round.id) : -1
  const hasBranches = siblingRounds.length > 1
  const taskSlotsForRound = isAssistant ? getRoundTaskSlots(round ?? null, tasks) : []
  const tasksForRound = taskSlotsForRound.map((slot) => slot.task).filter(Boolean) as TaskRecord[]
  const favoriteTasksForRound = tasksForRound.filter((task) => (task.outputImages?.length ?? 0) > 0)
  const hasRoundFavoriteTasks = favoriteTasksForRound.length > 0
  const allRoundTasksFavorited = hasRoundFavoriteTasks && favoriteTasksForRound.every((task) => task.isFavorite)
  const assistantBlocks = isAssistant ? getAgentAssistantBlocks(round ?? null, taskSlotsForRound, tasks, Boolean(message.content.trim())) : []
  const inputImagesForRound = (round?.inputImageIds || []).map((id) => ({ id, dataUrl: '' }))
  const parts = getPromptMentionParts(message.content, inputImagesForRound)

  return (
    <div className={`mb-6 flex w-full ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        ref={(node) => {
          if (!isAssistant) onRegisterUserMessageNode(message.roundId, node)
        }}
        className={`group flex max-w-[95%] flex-col md:max-w-[85%] lg:max-w-[75%] ${isAssistant ? 'items-start' : 'items-end'}`}
      >
        <article
          className={`relative flex min-w-[16rem] max-w-full flex-col rounded-2xl p-4 transition-all duration-200 ${
            isAssistant
              ? 'rounded-tl-sm border border-gray-200 bg-white/70 hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:bg-white/[0.04]'
              : `rounded-tr-sm bg-gray-100 dark:bg-[#2A2D31] ${isEditing ? 'ring-2 ring-blue-500/50 dark:ring-blue-400/50' : ''}`
          }`}
        >
          <div className="mb-2 flex items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
            <button type="button" onClick={(event) => { event.stopPropagation(); onSelectRound(message.roundId) }} className="font-medium transition-colors hover:text-gray-800 dark:hover:text-gray-200">
              <span className={isAssistant ? 'font-semibold text-blue-600 dark:text-blue-400' : 'font-semibold text-gray-700 dark:text-gray-200'}>{isAssistant ? 'Agent' : '用户'}</span>
              <span className="ml-1 font-normal opacity-60">· 第 {round?.index ?? '?'} 轮</span>
            </button>
          </div>

          {message.role === 'user' && round && round.inputImageIds.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" onClick={(event) => event.stopPropagation()}>
              {round.inputImageIds.map((imgId, imageIndex) => (
                <ChatImageThumb
                  key={imgId}
                  imageId={imgId}
                  imageIndex={imageIndex}
                  maskImageId={imgId === (round.maskTargetImageId ?? round.inputImageIds[0]) ? round.maskImageId : null}
                />
              ))}
            </div>
          )}

          {round?.status === 'error' && isAssistant && message.content.startsWith('请求失败：') ? (
            <AgentErrorMessage
              content={message.content}
              onPointerDown={onErrorCopyPointerDown}
              onClick={onErrorCopyClick}
            />
          ) : (
            <div data-selectable-text className={`text-[15px] leading-relaxed text-gray-800 dark:text-gray-100 ${!isAssistant ? 'select-text' : ''}`}>
              {isAssistant ? (
                <>
                  {assistantBlocks.length > 0 ? assistantBlocks.map((block, index) => {
                    if (block.type === 'web-search') return <AgentWebSearchStatusLines key={block.key} statuses={[block.status]} />
                    if (block.type === 'text') return <div key={block.key} className={index > 0 ? 'mt-3' : undefined}><MarkdownRenderer content={block.content ?? message.content} streaming={isStreamingAssistant} /></div>
                    if (block.type === 'batch-params') {
                      return (
                        <div key={block.key} className={index > 0 ? 'mt-3' : undefined}>
                          <AgentWebSearchInlineStatus status={block.status} />
                        </div>
                      )
                    }
                    if (block.type === 'deleted-image-task') {
                      return (
                        <div key={block.key} className="mt-4 flex min-h-[120px] w-full min-w-[16rem] max-w-sm flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-4 text-gray-400 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-500" onClick={(event) => event.stopPropagation()}>
                          <TrashIcon className="mb-2 h-6 w-6 opacity-50" />
                          <span className="text-xs">[Image Removed]</span>
                        </div>
                      )
                    }
                    return (
                      <div key={block.key} className="mt-4 max-w-sm" onClick={(event) => event.stopPropagation()}>
                        <TaskCard
                          task={block.task}
                          disableSwipe={true}
                          onClick={() => onOpenTaskDetail(block.task.id)}
                          onReuse={() => onReuseTask(block.task)}
                          onEditOutputs={() => editOutputs(block.task)}
                          onDelete={() => useStore.getState().setConfirmDialog({ title: '删除记录', message: '确定要删除这条记录吗？', action: () => removeTask(block.task) })}
                        />
                      </div>
                    )
                  }) : isStreamingAssistant ? <AgentStreamingCursor /> : null}
                </>
              ) : parts.some((part) => part.type === 'mention') ? (
                <div className="whitespace-pre-wrap break-words">
                  {parts.map((part, index) =>
                    part.type === 'text' ? <span key={index}>{part.text}</span> : <span key={index} className="mx-0.5 inline-flex items-center rounded-md bg-blue-100/50 px-1.5 py-0.5 align-baseline text-xs font-medium text-blue-700 dark:bg-blue-500/30 dark:text-blue-300">{part.text}</span>
                  )}
                </div>
              ) : (
                <MarkdownRenderer content={parts[0]?.text ?? ''} />
              )}
            </div>
          )}
        </article>

        {!isStreamingAssistant && (
          <div className={`mt-2 flex w-full min-w-fit items-center justify-between gap-3 px-1 transition-opacity duration-200 ${isEditing || hasBranches ? 'opacity-100' : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100'}`} onClick={(event) => event.stopPropagation()}>
            <div className="flex min-w-0 items-center gap-2">
              {isEditing && (
                <div className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">
                  <span className="truncate">正在编辑</span>
                  <AgentActionButton
                    tooltip="取消编辑"
                    className="ml-1 -mr-1 rounded-full p-0.5 transition-colors hover:bg-blue-200 dark:hover:bg-blue-500/40"
                    onClick={(event) => {
                      event.stopPropagation()
                      onCancelEditing()
                    }}
                  >
                    <CloseIcon className="h-3 w-3" />
                  </AgentActionButton>
                </div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-2 text-gray-400">
              {!isAssistant && round && hasBranches && siblingIndex >= 0 && (
                <div className="mr-1 inline-flex items-center text-sm font-bold text-gray-400 dark:text-gray-500">
                  <AgentActionButton tooltip="上一分支" className="rounded-md p-1 transition-colors hover:bg-gray-200/50 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-gray-200" onClick={() => onSwitchBranch(round, -1)}>
                    <ChevronLeftIcon className="h-4 w-4" />
                  </AgentActionButton>
                  <span className="px-1 tabular-nums tracking-widest">{siblingIndex + 1}/{siblingRounds.length}</span>
                  <AgentActionButton tooltip="下一分支" className="rounded-md p-1 transition-colors hover:bg-gray-200/50 hover:text-gray-800 dark:hover:bg-white/10 dark:hover:text-gray-200" onClick={() => onSwitchBranch(round, 1)}>
                    <ChevronRightIcon className="h-4 w-4" />
                  </AgentActionButton>
                </div>
              )}
              {isAssistant ? (
                <>
                  <AgentActionButton tooltip="复制输出文本" className={`rounded-md p-1.5 transition-colors ${message.content.trim() ? 'text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200' : 'cursor-not-allowed text-gray-300 opacity-50 dark:text-gray-600'}`} disabled={!message.content.trim()} onClick={() => {
                    onCopyMessage(getAgentAssistantCopyContent(message.content, assistantBlocks), '输出文本已复制', '复制输出文本失败')
                  }}>
                    <CopyIcon className="h-4 w-4" />
                  </AgentActionButton>
                  <AgentActionButton tooltip="重新生成" className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-500/10" onClick={() => {
                    if (round) void regenerateAgentAssistantMessage(conversation.id, round.id)
                  }}>
                    <RefreshIcon className="h-4 w-4" />
                  </AgentActionButton>
                  <AgentActionButton tooltip={allRoundTasksFavorited ? '取消收藏所有图片' : '收藏所有图片'} className={`rounded-md p-1.5 transition-colors ${hasRoundFavoriteTasks ? (allRoundTasksFavorited ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-500/10' : 'text-gray-400 hover:bg-yellow-50 hover:text-yellow-500 dark:hover:bg-yellow-500/10') : 'cursor-not-allowed text-gray-300 opacity-50 dark:text-gray-600'}`} disabled={!hasRoundFavoriteTasks} onClick={() => {
                    if (!hasRoundFavoriteTasks) return
                    const nextFavorite = !allRoundTasksFavorited
                    favoriteTasksForRound.forEach((task) => updateTaskInStore(task.id, { isFavorite: nextFavorite }))
                    useStore.getState().showToast(nextFavorite ? `已收藏 ${favoriteTasksForRound.length} 个任务的图片` : `已取消收藏 ${favoriteTasksForRound.length} 个任务的图片`, 'success')
                  }}>
                    <FavoriteIcon className="h-4 w-4" filled={allRoundTasksFavorited} />
                  </AgentActionButton>
                  <AgentActionButton tooltip="下载所有图片" className={`rounded-md p-1.5 transition-colors ${getRoundTasks(round ?? null, tasks).filter(Boolean).length > 0 ? 'text-gray-400 hover:bg-green-50 hover:text-green-500 dark:hover:bg-green-500/10' : 'cursor-not-allowed text-gray-300 opacity-50 dark:text-gray-600'}`} disabled={getRoundTasks(round ?? null, tasks).filter(Boolean).length === 0} onClick={async () => {
                    const imageIds = tasksForRound.flatMap((task) => task.outputImages || [])
                    if (imageIds.length === 0) return
                    try {
                      const roundIndex = round?.index ?? 0
                      const { successCount, failCount } = await downloadImageIds(imageIds, `agent-round-${roundIndex}`)
                      if (successCount === 0) {
                        useStore.getState().showToast('下载失败', 'error')
                      } else if (failCount > 0) {
                        useStore.getState().showToast(`部分下载失败：成功 ${successCount}，失败 ${failCount}`, 'error')
                      } else {
                        useStore.getState().showToast(successCount > 1 ? `下载成功：${successCount} 张图片` : '下载成功', 'success')
                      }
                    } catch (err) {
                      console.error(err)
                      useStore.getState().showToast('下载失败', 'error')
                    }
                  }}>
                    <DownloadIcon className="h-4 w-4" />
                  </AgentActionButton>
                  <AgentActionButton tooltip="删除消息" className="rounded-md p-1.5 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10" onClick={() => {
                    if (round) onDeleteMessage(message, round)
                  }}>
                    <TrashIcon className="h-4 w-4" />
                  </AgentActionButton>
                </>
              ) : (
                <>
                  <AgentActionButton tooltip="复制提示词" className="rounded-md p-1.5 transition-colors hover:bg-gray-200/50 hover:text-gray-700 dark:hover:bg-white/[0.04] dark:hover:text-gray-200" onClick={() => {
                    onCopyMessage(message.content)
                  }}>
                    <CopyIcon className="h-4 w-4" />
                  </AgentActionButton>
                  <AgentActionButton tooltip="编辑" className="rounded-md p-1.5 transition-colors hover:bg-gray-200/50 hover:text-gray-700 dark:hover:bg-white/[0.04] dark:hover:text-gray-200" onClick={() => {
                    if (round) void onEditRoundMessage(round, message.content)
                  }}>
                    <EditIcon className="h-4 w-4" />
                  </AgentActionButton>
                  <AgentActionButton tooltip="删除" className="rounded-md p-1.5 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30 dark:hover:text-red-400" onClick={() => {
                    if (round) onDeleteMessage(message, round)
                  }}>
                    <TrashIcon className="h-4 w-4" />
                  </AgentActionButton>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
