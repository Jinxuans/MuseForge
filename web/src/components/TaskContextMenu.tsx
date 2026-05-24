import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import {
  canCancelQueuedServerTask,
  cancelQueuedServerTask,
  editOutputs,
  moveTasksToTrash,
  removeTask,
  restoreTasksFromTrash,
  reuseConfig,
  updateTaskInStore,
  useStore,
} from '../store'
import type { TaskRecord } from '../types'
import { suppressGlobalClicks } from '../lib/clickSuppression'

interface MenuInfo {
  taskId: string
  x: number
  y: number
}

export default function TaskContextMenu() {
  const [menuInfo, setMenuInfo] = useState<MenuInfo | null>(null)
  const tasks = useStore((s) => s.tasks)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setMoveCategoryTaskIds = useStore((s) => s.setMoveCategoryTaskIds)
  const setShareToSquareTarget = useStore((s) => s.setShareToSquareTarget)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const menuRef = useRef<HTMLDivElement>(null)
  const task = menuInfo ? tasks.find((item) => item.id === menuInfo.taskId) ?? null : null

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (!target) return
      if (target.closest('img, button, a, input, textarea, select, [data-no-task-context-menu]')) return
      const card = target.closest<HTMLElement>('.task-card-wrapper[data-task-id]')
      const taskId = card?.dataset.taskId
      if (!taskId) return

      event.preventDefault()
      setMenuInfo({ taskId, x: event.clientX, y: event.clientY })
    }

    window.addEventListener('contextmenu', onContextMenu)
    return () => window.removeEventListener('contextmenu', onContextMenu)
  }, [])

  useEffect(() => {
    if (!menuInfo) return
    const close = (event: Event) => {
      if (menuRef.current && event.target instanceof Node && menuRef.current.contains(event.target)) return
      if (event.type === 'mousedown' || event.type === 'touchstart') suppressGlobalClicks()
      setMenuInfo(null)
    }
    window.addEventListener('mousedown', close, { capture: true })
    window.addEventListener('touchstart', close, { capture: true })
    window.addEventListener('wheel', close, { capture: true })
    window.addEventListener('scroll', close, { capture: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', close, { capture: true })
      window.removeEventListener('touchstart', close, { capture: true })
      window.removeEventListener('wheel', close, { capture: true })
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [menuInfo])

  if (!menuInfo || !task) return null

  const close = () => setMenuInfo(null)
  const run = (action: (task: TaskRecord) => void | Promise<unknown>) => {
    close()
    void action(task)
  }
  const showCancelQueued = canCancelQueuedServerTask(task)
  const confirmDelete = (taskToDelete: TaskRecord) => {
    setConfirmDialog({
      title: taskToDelete.deletedAt ? '彻底删除记录' : '移入回收站',
      message: taskToDelete.deletedAt
        ? '确定要彻底删除这条记录吗？关联的图片资源也会被清理（如果没有其他任务引用）。'
        : '确定要把这条记录移入回收站吗？图片资源会保留，之后可以恢复或彻底删除。',
      action: () => {
        if (taskToDelete.deletedAt) {
          void removeTask(taskToDelete)
        } else {
          moveTasksToTrash([taskToDelete.id])
        }
      },
    })
  }

  let left = menuInfo.x
  let top = menuInfo.y
  const width = 172
  const height = task.deletedAt ? 244 : showCancelQueued ? 326 : 286
  if (left + width > window.innerWidth) left -= width
  if (top + height > window.innerHeight) top -= height

  return (
    <div
      ref={menuRef}
      className="fixed z-[9998] w-[172px] overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-xl animate-fade-in dark:border-white/[0.08] dark:bg-gray-900"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <MenuButton onClick={() => run((item) => setDetailTaskId(item.id))}>打开详情</MenuButton>
      <MenuButton onClick={() => run(reuseConfig)}>复用配置</MenuButton>
      <MenuButton disabled={!task.outputImages.length} onClick={() => run(editOutputs)}>编辑输出</MenuButton>
      {!task.deletedAt && (
        <MenuButton
          disabled={task.status !== 'done' || !task.outputImages.length}
          onClick={() => run((item) => setShareToSquareTarget({ kind: 'task', taskId: item.id }))}
        >
          分享到广场
        </MenuButton>
      )}
      <MenuButton onClick={() => run((item) => updateTaskInStore(item.id, { isFavorite: !item.isFavorite }))}>
        {task.isFavorite ? '取消收藏' : '收藏记录'}
      </MenuButton>
      {!task.deletedAt && (
        <MenuButton onClick={() => run((item) => setMoveCategoryTaskIds([item.id]))}>移动分类</MenuButton>
      )}
      {showCancelQueued && !task.deletedAt && (
        <MenuButton onClick={() => run(cancelQueuedServerTask)}>取消排队任务</MenuButton>
      )}
      {task.deletedAt && (
        <MenuButton onClick={() => run((item) => restoreTasksFromTrash([item.id]))}>恢复记录</MenuButton>
      )}
      <div className="my-1 h-px bg-gray-100 dark:bg-white/[0.08]" />
      <MenuButton danger onClick={() => run(confirmDelete)}>
        {task.deletedAt ? '彻底删除' : '移入回收站'}
      </MenuButton>
    </div>
  )
}

function MenuButton({
  children,
  danger,
  disabled,
  onClick,
}: {
  children: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center px-4 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        danger
          ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'
          : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.06]'
      }`}
    >
      {children}
    </button>
  )
}
