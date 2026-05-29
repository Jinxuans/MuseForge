import type { TouchEvent } from 'react'
import { ChevronDownIcon, EditIcon, SidebarLeftIcon } from '../../shared/ui/icons'

export function AgentMobilePullIndicator({
  offset,
  maxOffset,
}: {
  offset: number
  maxOffset: number
}) {
  if (offset <= 0) return null

  return (
    <div
      className="fixed left-0 right-0 top-0 z-50 flex items-end justify-center pointer-events-none sm:hidden"
      style={{ height: `${offset + 10}px`, opacity: offset / maxOffset }}
    >
      <div className="mb-2 rounded-full bg-black/60 p-1 text-white shadow-lg backdrop-blur-sm">
        <ChevronDownIcon className="h-4 w-4" />
      </div>
    </div>
  )
}

export default function AgentMobileHeader({
  visible,
  title,
  onOpenSidebar,
  onEditTitle,
  onCreateConversation,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
}: {
  visible: boolean
  title: string
  onOpenSidebar: () => void
  onEditTitle: () => void
  onCreateConversation: () => void
  onTouchStart: (event: TouchEvent<HTMLDivElement>) => void
  onTouchMove: (event: TouchEvent<HTMLDivElement>) => void
  onTouchEnd: (event: TouchEvent<HTMLDivElement>) => void
}) {
  return (
    <div className={`sticky top-0 z-20 overflow-hidden transition-all duration-300 ease-in-out lg:hidden ${visible ? 'mb-2 max-h-16 opacity-100' : 'mb-0 max-h-0 opacity-0 pointer-events-none'}`}>
      <div
        className="flex h-14 items-center justify-between border-b border-gray-200 bg-white/80 px-2 backdrop-blur dark:border-white/[0.08] dark:bg-gray-950/80"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <button type="button" onClick={onOpenSidebar} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.04] dark:hover:text-gray-200" title="展开对话列表">
          <SidebarLeftIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onEditTitle}
          className="min-w-0 flex-1 truncate rounded px-2 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/[0.04]"
        >
          {title}
        </button>
        <button type="button" onClick={onCreateConversation} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:hover:bg-white/[0.04] dark:hover:text-gray-200" title="新对话">
          <EditIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}
