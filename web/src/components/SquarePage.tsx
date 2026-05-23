import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SquareShareAssetSummary, SquareShareDetail, SquareShareKind, SquareShareSummary } from '../types'
import { useStore } from '../store'
import { isSquareApiConfigured, resolveSquareAssetUrl, squareApiClient, summarizeSquareShare } from '../lib/squareApiClient'
import SquareCard from './SquareCard'
import SquareImageLightbox, { type SquareLightboxImage } from './SquareImageLightbox'
import SquareTaskDetailModal from './SquareTaskDetailModal'
import { RefreshIcon } from './icons'

type SquareFeedKind = SquareShareKind | 'mine'

const SQUARE_TABS: Array<{ label: string; value: SquareFeedKind }> = [
  { label: '任务', value: 'task' },
  { label: '提示词', value: 'prompt' },
  { label: '我分享的', value: 'mine' },
]

function resolveTabDescription(tab: SquareFeedKind) {
  if (tab === 'prompt') return '浏览、复制和复用公开提示词'
  if (tab === 'mine') return '管理自己发布过的分享'
  return '查看包含参数、图片和任务链的公开图任务'
}

function resolveAssetPreviewImage(asset: SquareShareAssetSummary | null | undefined, title: string): SquareLightboxImage | null {
  const url = asset?.originalUrl || asset?.thumbUrl
  return url ? { src: resolveSquareAssetUrl(url), title } : null
}

export default function SquarePage() {
  const setPrompt = useStore((state) => state.setPrompt)
  const setAppMode = useStore((state) => state.setAppMode)
  const showToast = useStore((state) => state.showToast)
  const [activeTab, setActiveTab] = useState<SquareFeedKind>('task')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SquareShareSummary[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [previewImages, setPreviewImages] = useState<SquareLightboxImage[]>([])
  const [previewIndex, setPreviewIndex] = useState(0)
  const [detailShare, setDetailShare] = useState<SquareShareDetail | null>(null)
  const configured = useMemo(() => isSquareApiConfigured(), [])

  const loadPage = useCallback(async (cursor?: string | null) => {
    if (!configured) {
      setItems([])
      setNextCursor(null)
      setError('')
      return
    }

    if (cursor) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
    }
    setError('')

    try {
      const result = activeTab === 'mine'
        ? await squareApiClient.listMyShares({ q: query, cursor: cursor || undefined, limit: 30 })
        : await squareApiClient.listSquare({ kind: activeTab, q: query, cursor: cursor || undefined, limit: 30 })
      setItems((current) => cursor ? [...current, ...result.items] : result.items)
      setNextCursor(result.nextCursor)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载广场失败')
      if (!cursor) {
        setItems([])
        setNextCursor(null)
      }
    } finally {
      setIsLoading(false)
      setIsLoadingMore(false)
    }
  }, [activeTab, configured, query])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPage(null)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [loadPage])

  const handleCopyPrompt = async (prompt: string) => {
    if (!prompt.trim()) return
    try {
      await navigator.clipboard.writeText(prompt)
      showToast('提示词已复制', 'success')
    } catch {
      showToast('复制提示词失败', 'error')
    }
  }

  const handleUsePrompt = (prompt: string) => {
    if (!prompt.trim()) return
    setPrompt(prompt)
    setAppMode('gallery')
    showToast('已填入输入框', 'success')
  }

  const handleOpenImagePreview = async (item: SquareShareSummary) => {
    const title = summarizeSquareShare(item)
    const fallbackImage = resolveAssetPreviewImage(item.coverAsset, title)
    if (!fallbackImage) return
    setPreviewImages([fallbackImage])
    setPreviewIndex(0)

    try {
      const detail = await squareApiClient.getShare(item.id)
      const detailImages = (detail.assets ?? [])
        .map((asset, index) => resolveAssetPreviewImage(asset, `${title} ${index + 1}`))
        .filter((image): image is SquareLightboxImage => Boolean(image))
      if (detailImages.length > 0) {
        setPreviewImages(detailImages)
        const coverIndex = detailImages.findIndex((image) => image.src === fallbackImage.src)
        setPreviewIndex(coverIndex >= 0 ? coverIndex : 0)
      }
    } catch {
      // Keep the cover preview when the detail endpoint is unavailable.
    }
  }

  const handleOpenShareDetail = async (item: SquareShareSummary) => {
    if (item.kind !== 'task') return
    try {
      setDetailShare(await squareApiClient.getShare(item.id))
    } catch (err) {
      showToast(err instanceof Error ? err.message : '加载任务详情失败', 'error')
    }
  }

  const handleDeleteMineShare = async (item: SquareShareSummary) => {
    if (!window.confirm(`确定取消分享「${summarizeSquareShare(item)}」吗？`)) return
    try {
      await squareApiClient.deleteShare(item.id)
      showToast('已取消分享', 'success')
      await loadPage(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '取消分享失败', 'error')
    }
  }

  return (
    <main className="pb-16">
      <div className="safe-area-x mx-auto max-w-7xl">
        <section className="space-y-4 pt-3">
          <div className="rounded-3xl border border-gray-200/80 bg-white/[0.9] px-4 py-4 shadow-[0_18px_44px_-38px_rgba(15,23,42,0.66)] backdrop-blur dark:border-white/[0.08] dark:bg-gray-900/[0.78]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">创作分享广场</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{resolveTabDescription(activeTab)}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="inline-flex rounded-full border border-gray-200/80 bg-white/90 p-0.5 dark:border-white/[0.08] dark:bg-gray-900/80">
                  {SQUARE_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setActiveTab(tab.value)}
                      className={`h-8 rounded-full px-3 text-xs font-medium transition ${
                        activeTab === tab.value
                          ? 'bg-blue-500 text-white shadow-[0_12px_24px_-16px_rgba(37,99,235,0.9)]'
                          : 'text-gray-600 hover:bg-gray-100/80 dark:text-gray-300 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <div className="relative min-w-0 sm:w-64">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索标题、提示词、标签"
                    className="h-9 w-full rounded-full border border-gray-200/90 bg-white px-4 pr-9 text-xs text-gray-700 shadow-sm transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-200"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                      aria-label="清空搜索"
                    >
                      ×
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void loadPage(null)}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-gray-200/90 bg-white px-3 text-xs font-medium text-gray-600 shadow-sm transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                >
                  <RefreshIcon className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  刷新
                </button>
              </div>
            </div>

            {!configured && (
              <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200">
                广场 API 尚未配置。设置 `VITE_SQUARE_API_URL` 后，这个页面会通过 `/api/v1` 协议读取广场内容。
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm text-red-600 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className={`mb-4 break-inside-avoid animate-pulse rounded-2xl border border-gray-200/70 bg-white/70 dark:border-white/[0.08] dark:bg-white/[0.03] ${
                    index % 3 === 0 ? 'h-80' : index % 3 === 1 ? 'h-64' : 'h-96'
                  }`}
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[18rem] items-center justify-center rounded-3xl border border-dashed border-gray-200/90 bg-white/[0.55] px-4 text-center text-sm text-gray-400 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-500">
              {configured ? '暂时没有匹配的广场内容' : '等待连接广场 API'}
            </div>
          ) : (
            <>
              <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 2xl:columns-4">
                {items.map((item) => (
                  <SquareCard
                    key={item.id}
                    item={item}
                    mine={activeTab === 'mine'}
                    onCopyPrompt={handleCopyPrompt}
                    onUsePrompt={handleUsePrompt}
                    onOpenPreview={handleOpenImagePreview}
                    onOpenDetail={handleOpenShareDetail}
                    onDelete={activeTab === 'mine' ? handleDeleteMineShare : undefined}
                  />
                ))}
              </div>
              {nextCursor && (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    disabled={isLoadingMore}
                    onClick={() => void loadPage(nextCursor)}
                    className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:opacity-60 dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                  >
                    {isLoadingMore ? '加载中...' : '加载更多'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {previewImages.length > 0 && (
        <SquareImageLightbox
          images={previewImages}
          index={previewIndex}
          onIndexChange={setPreviewIndex}
          onClose={() => setPreviewImages([])}
        />
      )}
      {detailShare && (
        <SquareTaskDetailModal
          share={detailShare}
          onClose={() => setDetailShare(null)}
          onCopyPrompt={handleCopyPrompt}
          onUsePrompt={handleUsePrompt}
        />
      )}
    </main>
  )
}
