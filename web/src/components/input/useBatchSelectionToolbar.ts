import { useCallback, useMemo } from 'react'
import { UNCATEGORIZED_CATEGORY_ID } from '../../lib/categories'
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
      if (activeCategoryId === UNCATEGORIZED_CATEGORY_ID && task.categoryId) return false
      if (activeCategoryId !== 'all' && activeCategoryId !== UNCATEGORIZED_CATEGORY_ID && task.categoryId !== activeCategoryId) return false
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
