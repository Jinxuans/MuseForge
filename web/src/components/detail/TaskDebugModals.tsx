import type { RefObject } from 'react'
import type { TaskRecord } from '../../types'
import { copyTextToClipboard, getClipboardFailureMessage } from '../../lib/clipboard'
import ModalFrame from '../../shared/ui/ModalFrame'
import { CloseIcon, CopyIcon } from '../../shared/ui/icons'

type ModalRef = RefObject<HTMLDivElement | null>

function clearTextSelection() {
  const selection = window.getSelection()
  if (selection && !selection.isCollapsed) selection.removeAllRanges()
}

export function RawImageUrlsModal({
  rawImageUrls,
  modalRef,
  onClose,
  showToast,
}: {
  rawImageUrls: string[]
  modalRef: ModalRef
  onClose: () => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
}) {
  if (rawImageUrls.length === 0) return null

  return (
    <ModalFrame
      panelRef={modalRef}
      onClose={onClose}
      panelClassName="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#1c1c1e]"
    >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08] shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">原始图片链接 ({rawImageUrls.length})</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await copyTextToClipboard(rawImageUrls.join('\n'))
                  showToast('复制成功', 'success')
                } catch (err) {
                  showToast(getClipboardFailureMessage('复制失败', err), 'error')
                }
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors text-xs font-medium"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              全部复制
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-300 transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 bg-gray-50/50 dark:bg-black/20 overscroll-contain">
          <div className="space-y-2.5">
            {rawImageUrls.map((url, i) => (
              <div key={i} className="group flex items-center gap-3 p-3 sm:p-4 rounded-xl bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-white/[0.06] shadow-sm hover:shadow-md transition-all">
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="text-xs font-medium text-gray-400 dark:text-gray-500">
                    图片 {i + 1}
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 truncate select-text" title={url}>
                    {url}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await copyTextToClipboard(url)
                      showToast('复制成功', 'success')
                    } catch (err) {
                      showToast(getClipboardFailureMessage('复制失败', err), 'error')
                    }
                  }}
                  className="flex-shrink-0 p-2 sm:px-3 sm:py-1.5 flex items-center justify-center gap-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors text-xs font-medium border border-transparent dark:border-white/[0.04]"
                  title="复制链接"
                >
                  <CopyIcon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                  <span className="hidden sm:inline">复制</span>
                </button>
              </div>
            ))}
          </div>
        </div>
    </ModalFrame>
  )
}

export function TaskDebugSnapshotModal({
  task,
  rawImageUrls,
  sanitizedRawResponsePayload,
  taskProviderName,
  taskProfileName,
  taskModel,
  modalRef,
  formatTime,
  onClose,
  onCopyDebugSnapshot,
}: {
  task: TaskRecord
  rawImageUrls: string[]
  sanitizedRawResponsePayload: string
  taskProviderName: string
  taskProfileName: string
  taskModel: string
  modalRef: ModalRef
  formatTime: (ts: number | null) => string
  onClose: () => void
  onCopyDebugSnapshot: () => void
}) {
  return (
    <ModalFrame
      panelRef={modalRef}
      onClose={onClose}
      panelClassName="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#1c1c1e]"
      onPanelPointerDown={(e) => {
          if (!(e.target as Element).closest('[data-selectable-text]')) clearTextSelection()
      }}
    >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08] shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">错误快照</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopyDebugSnapshot}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors text-xs font-medium"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              复制快照
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-300 transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50/50 p-4 dark:bg-black/20 sm:p-5 overscroll-contain">
          <div data-selectable-text className="space-y-4 select-text">
            <section className="rounded-xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-[#1c1c1e]">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">错误信息</h4>
              <div className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
                <p className="whitespace-pre-wrap break-words text-red-500 dark:text-red-300">{task.error || '生成失败'}</p>
                {task.errorDebug?.message && task.errorDebug.message !== task.error && (
                  <p className="whitespace-pre-wrap break-words">{task.errorDebug.message}</p>
                )}
                <p className="text-gray-400 dark:text-gray-500">
                  创建 {formatTime(task.createdAt)}
                  {task.finishedAt ? ` · 结束 ${formatTime(task.finishedAt)}` : ''}
                  {task.errorDebug?.createdAt ? ` · 快照 ${formatTime(task.errorDebug.createdAt)}` : ''}
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-[#1c1c1e]">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">请求配置</h4>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <div>
                  <div className="text-gray-400 dark:text-gray-500">Provider</div>
                  <div className="mt-0.5 truncate font-medium text-gray-700 dark:text-gray-200">{taskProviderName}</div>
                </div>
                <div>
                  <div className="text-gray-400 dark:text-gray-500">Profile</div>
                  <div className="mt-0.5 truncate font-medium text-gray-700 dark:text-gray-200">{taskProfileName}</div>
                </div>
                <div>
                  <div className="text-gray-400 dark:text-gray-500">Mode</div>
                  <div className="mt-0.5 truncate font-medium text-gray-700 dark:text-gray-200">{task.apiMode || '未知'}</div>
                </div>
                <div>
                  <div className="text-gray-400 dark:text-gray-500">Model</div>
                  <div className="mt-0.5 truncate font-medium text-gray-700 dark:text-gray-200">{taskModel}</div>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-[#1c1c1e]">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">参数</h4>
              <pre className="text-[11px] text-gray-600 dark:text-gray-300 font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(task.params, null, 2)}
              </pre>
            </section>

            {rawImageUrls.length > 0 && (
              <section className="rounded-xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-[#1c1c1e]">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">原始图片链接</h4>
                <pre className="text-[11px] text-gray-600 dark:text-gray-300 font-mono whitespace-pre-wrap break-all">
                  {rawImageUrls.join('\n')}
                </pre>
              </section>
            )}

            {sanitizedRawResponsePayload && (
              <section className="rounded-xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-[#1c1c1e]">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">原始响应</h4>
                <pre className="text-[11px] text-gray-600 dark:text-gray-300 font-mono whitespace-pre-wrap break-all">
                  {sanitizedRawResponsePayload}
                </pre>
              </section>
            )}

            {task.errorDebug && (
              <section className="rounded-xl border border-gray-100 bg-white p-4 dark:border-white/[0.06] dark:bg-[#1c1c1e]">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">完整调试对象</h4>
                <pre className="text-[11px] text-gray-600 dark:text-gray-300 font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(task.errorDebug, null, 2)}
                </pre>
              </section>
            )}
          </div>
        </div>
    </ModalFrame>
  )
}

export function RawResponseModal({
  rawResponsePayload,
  sanitizedRawResponsePayload,
  modalRef,
  onClose,
  showToast,
}: {
  rawResponsePayload: string
  sanitizedRawResponsePayload: string
  modalRef: ModalRef
  onClose: () => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
}) {
  return (
    <ModalFrame
      panelRef={modalRef}
      onClose={onClose}
      panelClassName="flex w-full max-w-3xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#1c1c1e]"
      onPanelPointerDown={(e) => {
          if (!(e.target as Element).closest('[data-selectable-text]')) clearTextSelection()
      }}
    >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08] shrink-0">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">原始响应数据</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  await copyTextToClipboard(rawResponsePayload)
                  showToast('复制成功', 'success')
                } catch (err) {
                  showToast(getClipboardFailureMessage('复制失败', err), 'error')
                }
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/[0.08] transition-colors text-xs font-medium"
            >
              <CopyIcon className="w-3.5 h-3.5" />
              全部复制
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-white/[0.08] dark:hover:text-gray-300 transition-colors"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 bg-gray-50/50 dark:bg-black/20 overscroll-contain">
          <pre data-selectable-text className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-300 font-mono whitespace-pre-wrap break-all select-text">
            {sanitizedRawResponsePayload}
          </pre>
        </div>
    </ModalFrame>
  )
}
