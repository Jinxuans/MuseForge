import type { TaskView } from '../../types'
import {
  CheckSquareIcon,
  CloseIcon,
  DashedSquareIcon,
  DownloadIcon,
  FavoriteIcon,
  FolderIcon,
  RestoreIcon,
  TrashIcon,
} from '../../shared/ui/icons'

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
          <CloseIcon className="w-5 h-5" />
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
        <button
          onClick={onSelectAllToggle}
          className="p-2 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
          title={allSelected && filteredTaskCount > 0 ? '取消全选' : '全选当前可见'}
        >
          {allSelected && filteredTaskCount > 0 ? (
            <CheckSquareIcon className="w-5 h-5" />
          ) : (
            <DashedSquareIcon className="w-5 h-5" />
          )}
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
        <button
          onClick={onToggleFavorite}
          className="p-2 text-yellow-500 dark:text-yellow-400 hover:text-yellow-600 dark:hover:text-yellow-300 transition-colors"
          title="收藏/取消收藏"
        >
          <FavoriteIcon className="w-5 h-5" filled={allSelectedFavorite} />
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
        {taskView === 'trash' && (
          <>
            <button
              onClick={onRestoreSelected}
              className="p-2 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
              title="恢复选中"
            >
              <RestoreIcon className="w-5 h-5" />
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
              <FolderIcon className="w-5 h-5" />
            </button>
            <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
          </>
        )}
        <button
          onClick={onDownloadSelected}
          className="p-2 text-green-500 dark:text-green-400 hover:text-green-600 dark:hover:text-green-300 transition-colors"
          title="批量下载"
        >
          <DownloadIcon className="w-5 h-5" />
        </button>
        <div className="w-px h-5 bg-gray-200 dark:bg-white/20 mx-1" />
        <button
          onClick={onDeleteSelected}
          className="p-2 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 transition-colors"
          title="删除选中"
        >
          <TrashIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
