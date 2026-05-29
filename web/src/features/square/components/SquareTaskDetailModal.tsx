import type { SquareShareDetail } from '../../../types'
import { resolveSquareAssetUrl, summarizeSquareShare } from '../lib/squareApiClient'
import ModalFrame from '../../../shared/ui/ModalFrame'
import { CloseIcon, CopyIcon } from '../../../shared/ui/icons'

interface SquareTaskDetailModalProps {
  share: SquareShareDetail
  onClose: () => void
  onCopyPrompt: (prompt: string) => void
  onUsePrompt: (prompt: string) => void
}

export default function SquareTaskDetailModal({ share, onClose, onCopyPrompt, onUsePrompt }: SquareTaskDetailModalProps) {
  const title = summarizeSquareShare(share)
  const outputAssets = (share.assets ?? []).filter((asset) => asset.role !== 'origin_input')
  const originAssets = (share.assets ?? []).filter((asset) => asset.role === 'origin_input')

  return (
    <ModalFrame
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm"
      panelClassName="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/60 bg-white shadow-2xl dark:border-white/[0.08] dark:bg-gray-900"
    >
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              {new Date(share.createdAt).toLocaleString()} · {share.tags.join(' / ') || '未标记'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {outputAssets.length > 0 && (
            <section className="mb-6">
              <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">输出图片</h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {outputAssets.map((asset) => {
                  const url = asset.originalUrl || asset.thumbUrl
                  if (!url) return null
                  return (
                    <img
                      key={asset.assetId}
                      src={resolveSquareAssetUrl(url)}
                      alt=""
                      className="aspect-square rounded-2xl bg-gray-100 object-cover dark:bg-white/[0.04]"
                    />
                  )
                })}
              </div>
            </section>
          )}
          {originAssets.length > 0 && (
            <section className="mb-6">
              <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">链路素材</h4>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {originAssets.map((asset) => {
                  const url = asset.thumbUrl || asset.originalUrl
                  if (!url) return null
                  return (
                    <img
                      key={asset.assetId}
                      src={resolveSquareAssetUrl(url)}
                      alt=""
                      className="h-24 w-24 shrink-0 rounded-xl bg-gray-100 object-cover dark:bg-white/[0.04]"
                    />
                  )
                })}
              </div>
            </section>
          )}
          <section className="mb-6">
            <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">提示词</h4>
            <div className="rounded-2xl bg-gray-50 p-4 text-sm leading-6 text-gray-600 dark:bg-white/[0.04] dark:text-gray-300">
              <p className="whitespace-pre-wrap">{share.prompt}</p>
            </div>
          </section>
          {share.manifest != null && (
            <section>
              <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-200">分享快照</h4>
              <pre className="max-h-64 overflow-auto rounded-2xl bg-gray-950 p-4 text-xs leading-5 text-gray-100">
                {JSON.stringify(share.manifest, null, 2)}
              </pre>
            </section>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <button
            type="button"
            onClick={() => onCopyPrompt(share.prompt)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
          >
            <CopyIcon className="h-4 w-4" />
            复制提示词
          </button>
          <button
            type="button"
            onClick={() => onUsePrompt(share.prompt)}
            className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-600"
          >
            填入输入框
          </button>
        </div>
    </ModalFrame>
  )
}
