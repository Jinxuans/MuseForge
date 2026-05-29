import type { RefObject, TouchEvent as ReactTouchEvent } from 'react'
import type { AgentConversation, AgentMessage, AgentRound, TaskRecord } from '../../types'
import AgentChatMessageItem from './AgentChatMessageItem'

type AgentMessageListProps = {
  scrollContainerRef: RefObject<HTMLDivElement | null>
  bottomSentinelRef: RefObject<HTMLDivElement | null>
  conversation: AgentConversation | null
  activeMessages: AgentMessage[]
  activeRounds: AgentRound[]
  tasks: TaskRecord[]
  agentEditingRoundId: string | null
  onCreateConversation: () => void
  onTouchStart: (event: ReactTouchEvent<HTMLDivElement>) => void
  onTouchMove: (event: ReactTouchEvent<HTMLDivElement>) => void
  onTouchEnd: (event: ReactTouchEvent<HTMLDivElement>) => void
  onRegisterUserMessageNode: (roundId: string, node: HTMLElement | null) => void
  onSelectRound: (roundId: string) => void
  onCopyMessage: (content: string, successMessage?: string, failureMessage?: string) => void
  onSwitchBranch: (round: AgentRound, direction: -1 | 1) => void
  onCancelEditing: () => void
  onEditRoundMessage: (round: AgentRound, content: string) => void | Promise<void>
  onDeleteMessage: (message: AgentMessage, round: AgentRound) => void
  onReuseTask: (task: TaskRecord) => void
  onOpenTaskDetail: (taskId: string) => void
  onErrorCopyPointerDown: AgentChatMessageItemProps['onErrorCopyPointerDown']
  onErrorCopyClick: AgentChatMessageItemProps['onErrorCopyClick']
}

type AgentChatMessageItemProps = Parameters<typeof AgentChatMessageItem>[0]

function AgentRunningRoundPlaceholder({ round }: { round: AgentRound }) {
  return (
    <div className="mb-6 flex w-full justify-start">
      <article className="flex min-w-[16rem] max-w-[95%] flex-col rounded-2xl rounded-tl-sm border border-gray-200 bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03] md:max-w-[85%] lg:max-w-[75%]">
        <div className="mb-2 text-sm text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-blue-600 dark:text-blue-400">Agent</span>
          <span className="ml-1 font-normal opacity-60">· 第 {round.index} 轮</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          <span className="inline-flex items-center gap-1.5">
            <span>正在生成回复</span>
            <span className="flex gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
            </span>
          </span>
        </div>
      </article>
    </div>
  )
}

export default function AgentMessageList({
  scrollContainerRef,
  bottomSentinelRef,
  conversation,
  activeMessages,
  activeRounds,
  tasks,
  agentEditingRoundId,
  onCreateConversation,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
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
}: AgentMessageListProps) {
  const runningRounds = conversation
    ? activeRounds.filter((round) =>
        round.status === 'running' &&
        !conversation.messages.some((message) => message.roundId === round.id && message.role === 'assistant'),
      )
    : []

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 space-y-4 overflow-visible pb-[calc(var(--input-bar-clearance,12rem)+1.5rem)] px-1 lg:px-4 lg:pt-14"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {!conversation ? (
        <div className="py-20 text-center text-gray-400">
          <p className="mb-3">还没有 Agent 对话</p>
          <button type="button" onClick={onCreateConversation} className="rounded-lg bg-blue-500 px-4 py-2 text-white transition-colors hover:bg-blue-600">创建对话</button>
        </div>
      ) : activeMessages.length === 0 ? (
        <div className="py-20 text-center text-gray-400">
          <p className="mb-2">开始新的 Agent 对话</p>
          <p className="text-xs">在底部输入框发送消息即可创建第一轮对话。</p>
        </div>
      ) : (
        <>
          {activeMessages.map((message) => {
            const round = conversation.rounds.find((item) => item.id === message.roundId)
            return (
              <AgentChatMessageItem
                key={message.id}
                conversation={conversation}
                message={message}
                round={round}
                tasks={tasks}
                agentEditingRoundId={agentEditingRoundId}
                onRegisterUserMessageNode={onRegisterUserMessageNode}
                onSelectRound={onSelectRound}
                onCopyMessage={onCopyMessage}
                onSwitchBranch={onSwitchBranch}
                onCancelEditing={onCancelEditing}
                onEditRoundMessage={onEditRoundMessage}
                onDeleteMessage={onDeleteMessage}
                onReuseTask={onReuseTask}
                onOpenTaskDetail={onOpenTaskDetail}
                onErrorCopyPointerDown={onErrorCopyPointerDown}
                onErrorCopyClick={onErrorCopyClick}
              />
            )
          })}
          {runningRounds.map((round) => <AgentRunningRoundPlaceholder key={`running-${round.id}`} round={round} />)}
        </>
      )}
      <div ref={bottomSentinelRef} aria-hidden="true" />
    </div>
  )
}
