import { emptyTrash, useStore } from '../store'
import Select from './Select'

export default function SearchBar() {
  const searchQuery = useStore((s) => s.searchQuery)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const setFilterStatus = useStore((s) => s.setFilterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const setFilterFavorite = useStore((s) => s.setFilterFavorite)
  const taskView = useStore((s) => s.taskView)
  const setTaskView = useStore((s) => s.setTaskView)
  const categories = useStore((s) => s.categories)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const setActiveCategoryId = useStore((s) => s.setActiveCategoryId)
  const addCategory = useStore((s) => s.addCategory)
  const renameCategory = useStore((s) => s.renameCategory)
  const deleteCategory = useStore((s) => s.deleteCategory)
  const tasks = useStore((s) => s.tasks)

  const handleAddCategory = () => {
    const name = window.prompt('新分类名称')
    if (!name) return
    addCategory(name)
  }
  const activeCategory = categories.find((category) => category.id === activeCategoryId)
  const trashCount = tasks.filter((task) => task.deletedAt).length

  return (
    <div data-no-drag-select className="mt-6 mb-4 flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <div className="flex flex-shrink-0 rounded-xl border border-gray-200 bg-white p-1 dark:border-white/[0.08] dark:bg-gray-900">
          <button
            onClick={() => setTaskView('gallery')}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${taskView === 'gallery' ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.06]'}`}
          >
            画廊
          </button>
          <button
            onClick={() => setTaskView('trash')}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${taskView === 'trash' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-white/[0.06]'}`}
          >
            回收站
          </button>
        </div>
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Select
            value={activeCategoryId}
            onChange={(val) => setActiveCategoryId(val)}
            options={[
              { label: '全部分类', value: 'all' },
              { label: '未分类', value: '__uncategorized__' },
              ...categories.map((category) => ({ label: category.name, value: category.id })),
            ]}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-white/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
        </div>
        <button
          onClick={handleAddCategory}
          className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
        >
          新分类
        </button>
        {activeCategory && (
          <>
            <button
              onClick={() => {
                const name = window.prompt('重命名分类', activeCategory.name)
                if (name) renameCategory(activeCategory.id, name)
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              重命名
            </button>
            <button
              onClick={() => {
                if (window.confirm(`删除分类「${activeCategory.name}」？分类内任务会变为未分类。`)) deleteCategory(activeCategory.id)
              }}
              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-500 transition hover:bg-red-50 dark:border-red-500/20 dark:bg-gray-900 dark:hover:bg-red-500/10"
            >
              删除分类
            </button>
          </>
        )}
        {taskView === 'trash' && trashCount > 0 && (
          <button
            onClick={() => {
              if (window.confirm(`确定彻底删除回收站中的 ${trashCount} 条记录吗？`)) void emptyTrash()
            }}
            className="rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-500 transition hover:bg-red-50 dark:border-red-500/20 dark:bg-gray-900 dark:hover:bg-red-500/10"
          >
            清空回收站
          </button>
        )}
      </div>
      <div className="flex gap-3">
      <div className="flex gap-2 flex-shrink-0 z-20">
        <button
          onClick={() => setFilterFavorite(!filterFavorite)}
          className={`p-2.5 rounded-xl border transition-all ${
            filterFavorite
              ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-500/10 text-yellow-500'
              : 'border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 text-gray-400 hover:bg-gray-50 dark:hover:bg-white/[0.06]'
          }`}
          title={filterFavorite ? '取消只看收藏' : '只看收藏'}
        >
          <svg className="w-5 h-5" fill={filterFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
        <div className="relative w-28">
          <Select
            value={filterStatus}
            onChange={(val) => setFilterStatus(val as any)}
            options={[
              { label: '全部状态', value: 'all' },
              { label: '已完成', value: 'done' },
              { label: '生成中', value: 'running' },
              { label: '失败', value: 'error' },
            ]}
            className="px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-white/[0.06] text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
          />
        </div>
      </div>
      <div className="relative flex-1 z-10">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          type="text"
          placeholder="搜索提示词、参数..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.08] bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
        />
      </div>
      </div>
    </div>
  )
}
