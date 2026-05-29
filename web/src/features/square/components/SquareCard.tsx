import type { SquareShareSummary } from '../../../types'
import { resolveSquareAssetUrl, summarizeSquareShare } from '../lib/squareApiClient'
import { CopyIcon, ExternalLinkIcon, TrashIcon } from '../../../shared/ui/icons'

interface SquareCardProps {
  item: SquareShareSummary
  mine?: boolean
  onCopyPrompt: (prompt: string) => void
  onUsePrompt: (prompt: string) => void
  onOpenPreview: (item: SquareShareSummary) => void
  onOpenDetail: (item: SquareShareSummary) => void
  onDelete?: (item: SquareShareSummary) => void
}

function formatDate(value: number) {
  return new Date(value).toLocaleDateString()
}

export default function SquareCard({
  item,
  mine,
  onCopyPrompt,
  onUsePrompt,
  onOpenPreview,
  onOpenDetail,
  onDelete,
}: SquareCardProps) {
  const title = summarizeSquareShare(item)
  const coverUrl = item.coverAsset?.thumbUrl || item.coverAsset?.originalUrl

  return (
    <article className="mb-4 break-inside-avoid overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/[0.08] dark:bg-gray-900">
      {coverUrl && (
        <button
          type="button"
          onClick={() => onOpenPreview(item)}
          className="block w-full overflow-hidden bg-gray-100 text-left dark:bg-white/[0.04]"
        >
          <img src={resolveSquareAssetUrl(coverUrl)} alt={title} className="h-auto w-full object-cover transition hover:scale-[1.02]" />
        </button>
      )}
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
            <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
              {item.kind === 'prompt' ? '提示词' : '图任务'} · {formatDate(item.createdAt)}
              {typeof item.viewCount === 'number' ? ` · ${item.viewCount} 次浏览` : ''}
            </p>
          </div>
          {mine && item.status && (
            <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">
              {item.status}
            </span>
          )}
        </div>
        <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-5 text-gray-500 dark:text-gray-400">{item.prompt}</p>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.slice(0, 6).map((tag) => (
              <span key={tag} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            onClick={() => onUsePrompt(item.prompt)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-600"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            使用
          </button>
          <button
            type="button"
            onClick={() => onCopyPrompt(item.prompt)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <CopyIcon className="h-3.5 w-3.5" />
            复制
          </button>
          {item.kind === 'task' && (
            <button
              type="button"
              onClick={() => onOpenDetail(item)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              详情
            </button>
          )}
          {mine && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(item)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              取消分享
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
