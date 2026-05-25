import { useCallback, useMemo } from 'react'
import type { TaskView } from '../../types'
import { downloadImageIds, formatExportFileTime } from '../../lib/downloadImages'
import { moveTasksToTrash, removeMultipleTasks, restoreTasksFromTrash, updateTaskInStore, useStore } from '../../store'

export function useBatchSelectionToolbar() {
  const selectedTaskIds = useStore((s) => s.selectedTaskIds)
  const setSelectedTaskIds = useStore((s) => s.setSelectedTaskIds)
  const clearSelection = useStore((s) => s.clearSelection)
  const tasks = useStore((s) => s.tasks)
  const filterStatus = useStore((s) => s.filterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const searchQuery = useStore((s) => s.searchQuery)
  const taskView = useStore((s) => s.taskView)
  const activeCategoryId = useStore((s) => s.activeCategoryId)
  const setMoveCategoryTaskIds = useStore((s) => s.setMoveCategoryTaskIds)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)

  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt)
    const q = searchQuery.trim().toLowerCase()

    return sorted.filter((task) => {
      if (filterFavorite && !task.isFavorite) return false
      if (taskView === 'trash') {
        if (!task.deletedAt) return false
      } else if (task.deletedAt) {
        return false
      }
      if (activeCategoryId === '__uncategorized__' && task.categoryId) return false
      if (activeCategoryId !== 'all' && activeCategoryId !== '__uncategorized__' && task.categoryId !== activeCategoryId) return false
      const matchStatus = filterStatus === 'all' || task.status === filterStatus
      if (!matchStatus) return false

      if (!q) return true
      const prompt = (task.prompt || '').toLowerCase()
      const paramStr = JSON.stringify(task.params).toLowerCase()
      return prompt.includes(q) || paramStr.includes(q)
    })
  }, [activeCategoryId, filterFavorite, filterStatus, searchQuery, taskView, tasks])

  const handleSelectAllToggle = useCallback(() => {
    if (selectedTaskIds.length === filteredTasks.length && filteredTasks.length > 0) {
      clearSelection()
    } else {
      setSelectedTaskIds(filteredTasks.map((task) => task.id))
    }
  }, [clearSelection, filteredTasks, selectedTaskIds.length, setSelectedTaskIds])

  const handleToggleFavorite = useCallback(() => {
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id))
    const allFavorite = selectedTasks.length > 0 && selectedTasks.every((task) => task.isFavorite)
    const newFavoriteState = !allFavorite
    setConfirmDialog({
      title: newFavoriteState ? '批量收藏' : '批量取消收藏',
      message: newFavoriteState
        ? `确定要收藏选中的 ${selectedTaskIds.length} 条记录吗？`
        : `确定要取消收藏选中的 ${selectedTaskIds.length} 条记录吗？`,
      confirmText: newFavoriteState ? '确认收藏' : '确认取消',
      action: () => {
        selectedTaskIds.forEach((id) => {
          updateTaskInStore(id, { isFavorite: newFavoriteState })
        })
        clearSelection()
      },
    })
  }, [clearSelection, selectedTaskIds, setConfirmDialog, tasks])

  const handleDeleteSelected = useCallback(() => {
    setConfirmDialog({
      title: taskView === 'trash' ? '彻底删除' : '移入回收站',
      message: taskView === 'trash'
        ? `确定要彻底删除选中的 ${selectedTaskIds.length} 条记录吗？`
        : `确定要把选中的 ${selectedTaskIds.length} 条记录移入回收站吗？`,
      action: () => {
        if (taskView === 'trash') {
          removeMultipleTasks(selectedTaskIds)
        } else {
          moveTasksToTrash(selectedTaskIds)
        }
      },
    })
  }, [selectedTaskIds, setConfirmDialog, taskView])

  const handleRestoreSelected = useCallback(() => {
    restoreTasksFromTrash(selectedTaskIds)
  }, [selectedTaskIds])

  const handleMoveSelectedToCategory = useCallback(() => {
    setMoveCategoryTaskIds(selectedTaskIds)
  }, [selectedTaskIds, setMoveCategoryTaskIds])

  const handleDownloadSelected = useCallback(async () => {
    const selectedTasks = tasks.filter((task) => selectedTaskIds.includes(task.id))
    const imageIds = selectedTasks.flatMap((task) => task.outputImages || [])
    if (imageIds.length === 0) {
      showToast('选中的记录没有图片', 'info')
      return
    }

    try {
      const timeStr = formatExportFileTime(new Date())
      const { successCount, failCount } = await downloadImageIds(imageIds, `batch-${timeStr}`)

      if (successCount === 0) {
        showToast('下载失败', 'error')
      } else if (failCount > 0) {
        showToast(`部分下载失败：成功 ${successCount}，失败 ${failCount}`, 'error')
      } else {
        showToast(successCount > 1 ? `下载成功：${successCount} 张图片` : '下载成功', 'success')
      }
    } catch (err) {
      console.error(err)
      showToast('下载失败', 'error')
    }
    clearSelection()
  }, [clearSelection, selectedTaskIds, showToast, tasks])

  return {
    selectedCount: selectedTaskIds.length,
    filteredTaskCount: filteredTasks.length,
    allSelected: selectedTaskIds.length === filteredTasks.length,
    allSelectedFavorite: selectedTaskIds.length > 0 && selectedTaskIds.every((id) => tasks.find((task) => task.id === id)?.isFavorite),
    taskView,
    clearSelection,
    handleSelectAllToggle,
    handleToggleFavorite,
    handleRestoreSelected,
    handleMoveSelectedToCategory,
    handleDownloadSelected,
    handleDeleteSelected,
  }
}

interface BatchSelectionToolbarProps {
  selectedCount: number
  filteredTaskCount: number
  allSelected: boolean
  allSelectedFavorite: boolean
  taskView: TaskView
  onClearSelection: () => void
  onSelectAllToggle: () => void
  onToggleFavorite: () => void
  onRestoreSelected: () => void
  onMoveSelectedToCategory: () => void
  onDownloadSelected: () => void
  onDeleteSelected: () => void
}

export default function BatchSelectionToolbar({
  selectedCount,
  filteredTaskCount,
  allSelected,
  allSelectedFavorite,
  taskView,
  onClearSelection,
  onSelectAllToggle,
  onToggleFavorite,
  onRestoreSelected,
  onMoveSelectedToCategory,
  onDownloadSelected,
  onDeleteSelected,
}: BatchSelectionToolbarProps) {
  if (selectedCount <= 0) return null

  return (
    <div className="flex justify-center mb-3">
      <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-lg rounded-full flex items-center p-1 border border-gray-200/50 dark:border-white/10 pointer-events-auto">
        <button
          onClick={onClearSelection}
          className="p-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
          title="取消选择"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
        <button
          onClick={onSelectAllToggle}
          className="p-2 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
          title={allSelected && filteredTaskCount > 0 ? '取消全选' : '全选当前可见'}
        >
          {allSelected && filteredTaskCount > 0 ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path strokeDasharray="4 4" d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z" />
            </svg>
          )}
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
        <button
          onClick={onToggleFavorite}
          className="p-2 text-yellow-500 dark:text-yellow-400 hover:text-yellow-600 dark:hover:text-yellow-300 transition-colors"
          title="收藏/取消收藏"
        >
          {allSelectedFavorite ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          )}
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
        {taskView === 'trash' && (
          <>
            <button
              onClick={onRestoreSelected}
              className="p-2 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
              title="恢复选中"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
          </>
        )}
        {taskView !== 'trash' && (
          <>
            <button
              onClick={onMoveSelectedToCategory}
              className="p-2 text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors"
              title="移动分类"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
          </>
        )}
        <button
          onClick={onDownloadSelected}
          className="p-2 text-green-500 dark:text-green-400 hover:text-green-600 dark:hover:text-green-300 transition-colors"
          title="批量下载"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
        <button
          onClick={onDeleteSelected}
          className="p-2 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
          title="删除选中"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  )
}
