import type { KeyboardEvent, MouseEvent, PointerEvent, TouchEvent } from 'react'
import type { AgentConversation } from '../../types'
import { EditIcon, SidebarLeftIcon, TrashIcon } from '../../shared/ui/icons'
import { AgentActionButton } from './AgentMessageParts'

type AgentConversationSidebarProps = {
  collapsed: boolean
  activeConversationId: string | null
  conversations: AgentConversation[]
  searchQuery: string
  editingConversationId: string | null
  editingConversationTitle: string
  generatingTitleIds: Record<string, true>
  conversationActionsId: string | null
  onCollapsedChange: (collapsed: boolean) => void
  onCreateConversation: () => void
  onSearchQueryChange: (query: string) => void
  onEditingConversationTitleChange: (title: string) => void
  onConversationPointerDown: (id: string, event: PointerEvent<HTMLDivElement>) => void
  onClearConversationLongPressTimer: () => void
  onConversationSelect: (id: string) => void
  onRenameKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onConfirmRenameConversation: () => void
  onStartRenameConversation: (event: MouseEvent | TouchEvent, id: string, currentTitle: string) => void
  onDeleteConversation: (id: string) => void
}

function formatTime(value: number) {
  return new Date(value).toLocaleString()
}

export default function AgentConversationSidebar({
  collapsed,
  activeConversationId,
  conversations,
  searchQuery,
  editingConversationId,
  editingConversationTitle,
  generatingTitleIds,
  conversationActionsId,
  onCollapsedChange,
  onCreateConversation,
  onSearchQueryChange,
  onEditingConversationTitleChange,
  onConversationPointerDown,
  onClearConversationLongPressTimer,
  onConversationSelect,
  onRenameKeyDown,
  onConfirmRenameConversation,
  onStartRenameConversation,
  onDeleteConversation,
}: AgentConversationSidebarProps) {
  return (
    <>
      {!collapsed && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => onCollapsedChange(true)} />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-4/5 max-w-[320px] flex-col border-r border-gray-200 bg-white/95 shadow-2xl backdrop-blur transition-transform duration-300 dark:border-white/[0.08] dark:bg-gray-950/95 lg:hidden ${!collapsed ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full min-h-0 w-full flex-col pl-[max(1rem,env(safe-area-inset-left))]">
          <div className="safe-area-top shrink-0">
            <div className="flex h-14 items-center justify-between gap-2 px-4">
              <button type="button" onClick={() => onCollapsedChange(true)} className="-ml-2 rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-800 dark:hover:text-gray-200 lg:hidden" title="折叠左侧边栏">
                <SidebarLeftIcon className="h-5 w-5" />
              </button>
              <button type="button" onClick={onCreateConversation} className="-mr-2 rounded-lg p-2 text-gray-500 transition-colors hover:text-gray-800 dark:hover:text-gray-200 lg:hover:bg-gray-100 lg:dark:hover:bg-white/[0.04]" title="新对话">
                <EditIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="shrink-0 px-4 pb-3">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder="搜索聊天..."
              className="w-full rounded-xl border border-gray-200 bg-gray-100/80 px-3 py-2 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-400 focus:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white dark:focus:border-blue-400 dark:focus:bg-white/[0.07]"
            />
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-4 pb-4">
            {conversations.length === 0 && (
              <div className="px-2 py-8 text-center text-sm text-gray-400">没有找到匹配的聊天</div>
            )}
            {conversations.map((item) => {
              const isGeneratingTitle = Boolean(generatingTitleIds[item.id])
              return (
                <div
                  key={item.id}
                  data-agent-conversation-item
                  className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-100 dark:hover:bg-white/[0.04]"
                  onPointerDown={(event) => onConversationPointerDown(item.id, event)}
                  onPointerUp={onClearConversationLongPressTimer}
                  onPointerCancel={onClearConversationLongPressTimer}
                  onPointerLeave={onClearConversationLongPressTimer}
                  onContextMenu={(event) => {
                    if (conversationActionsId === item.id) event.preventDefault()
                  }}
                >
                  {editingConversationId === item.id ? (
                    <div className="flex h-[38px] min-w-0 flex-1 flex-col justify-center">
                      <input
                        type="text"
                        className="min-w-0 flex-1 rounded border border-blue-400/50 bg-white px-1.5 py-0.5 text-sm text-gray-900 shadow-sm outline-none focus:border-blue-500 dark:border-white/20 dark:bg-black/20 dark:text-white dark:focus:border-white/40"
                        value={editingConversationTitle}
                        onChange={(e) => onEditingConversationTitleChange(e.target.value)}
                        onKeyDown={onRenameKeyDown}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        onBlur={onConfirmRenameConversation}
                      />
                    </div>
                  ) : (
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onConversationSelect(item.id)}>
                      <div className={`truncate ${item.id === activeConversationId ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>{item.title}</div>
                      <div className="text-xs text-gray-400">{formatTime(item.updatedAt)}</div>
                    </button>
                  )}
                  <div className={`flex shrink-0 items-center gap-1 overflow-hidden transition-all duration-150 ${editingConversationId === item.id ? 'w-6 opacity-100' : `group-hover:w-[4.5rem] group-hover:opacity-100 group-focus-within:w-[4.5rem] group-focus-within:opacity-100 ${conversationActionsId === item.id ? 'w-[4.5rem] opacity-100' : 'w-0 opacity-0'}`}`}>
                    {editingConversationId === item.id ? (
                      <AgentActionButton
                        tooltip="确认"
                        onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); onConfirmRenameConversation() }}
                        className="rounded-md p-1.5 text-green-500 transition-colors hover:bg-gray-200 hover:text-green-600 dark:hover:bg-white/10"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </AgentActionButton>
                    ) : (
                      <>
                        <AgentActionButton tooltip="编辑标题" className="p-1.5 text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:text-gray-300 dark:hover:text-gray-200 dark:disabled:text-gray-600 dark:disabled:hover:text-gray-600" onClick={(event) => onStartRenameConversation(event, item.id, item.title)} disabled={isGeneratingTitle}>
                          <EditIcon className="h-4 w-4" />
                        </AgentActionButton>
                        <AgentActionButton tooltip="删除" className="p-1.5 text-gray-400 hover:text-red-500" onClick={(event) => { event.stopPropagation(); onDeleteConversation(item.id) }}>
                          <TrashIcon className="h-4 w-4" />
                        </AgentActionButton>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </aside>
    </>
  )
}
