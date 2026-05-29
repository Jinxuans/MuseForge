import { useMemo, useRef, useState } from 'react'
import { moveTasksToCategory, useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { CloseIcon, PlusIcon } from '../shared/ui/icons'

export default function MoveCategoryModal() {
  const moveCategoryTaskIds = useStore((s) => s.moveCategoryTaskIds)
  const setMoveCategoryTaskIds = useStore((s) => s.setMoveCategoryTaskIds)
  const categories = useStore((s) => s.categories)
  const addCategory = useStore((s) => s.addCategory)
  const tasks = useStore((s) => s.tasks)
  const [newCategoryName, setNewCategoryName] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  const active = Boolean(moveCategoryTaskIds?.length)
  const selectedTasks = useMemo(() => {
    const ids = new Set(moveCategoryTaskIds ?? [])
    return tasks.filter((task) => ids.has(task.id))
  }, [moveCategoryTaskIds, tasks])

  useCloseOnEscape(active, () => setMoveCategoryTaskIds(null))
  usePreventBackgroundScroll(active, modalRef)

  if (!active || !moveCategoryTaskIds) return null

  const close = () => setMoveCategoryTaskIds(null)
  const moveTo = (categoryId: string | null) => {
    moveTasksToCategory(moveCategoryTaskIds, categoryId)
    close()
  }
  const createAndMove = () => {
    const id = addCategory(newCategoryName)
    if (!id) return
    setNewCategoryName('')
    moveTo(id)
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={close}>
      <div
        ref={modalRef}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">移动分类</h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">已选择 {selectedTasks.length} 条记录</p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-4">
          <button
            type="button"
            onClick={() => moveTo(null)}
            className="mb-2 flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/[0.06]"
          >
            未分类
            <span className="text-xs text-gray-400">默认</span>
          </button>

          <div className="space-y-2">
            {categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => moveTo(category.id)}
                className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm font-medium text-gray-700 transition hover:border-blue-200 hover:bg-blue-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:hover:border-blue-400/20 dark:hover:bg-blue-500/10"
              >
                <span className="min-w-0 truncate">{category.name}</span>
                <span className="ml-3 text-xs text-gray-400">{tasks.filter((task) => task.categoryId === category.id && !task.deletedAt).length}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 p-4 dark:border-white/[0.08]">
          <div className="flex gap-2">
            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createAndMove()
              }}
              placeholder="新分类名称"
              className="h-10 min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
            />
            <button
              type="button"
              onClick={createAndMove}
              disabled={!newCategoryName.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-blue-500 px-3 text-sm font-medium text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              新建并移动
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
