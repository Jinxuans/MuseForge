import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../hooks/usePreventBackgroundScroll'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import { CloseIcon, CopyIcon, TrashIcon } from '../shared/ui/icons'

function formatTime(value: number) {
  return new Date(value).toLocaleString('zh-CN')
}

export default function PromptLibraryDrawer() {
  const showPromptLibrary = useStore((s) => s.showPromptLibrary)
  const setShowPromptLibrary = useStore((s) => s.setShowPromptLibrary)
  const prompt = useStore((s) => s.prompt)
  const setPrompt = useStore((s) => s.setPrompt)
  const promptLibrary = useStore((s) => s.promptLibrary)
  const savePromptToLibrary = useStore((s) => s.savePromptToLibrary)
  const updatePromptLibraryItem = useStore((s) => s.updatePromptLibraryItem)
  const deletePromptLibraryItem = useStore((s) => s.deletePromptLibraryItem)
  const setShareToSquareTarget = useStore((s) => s.setShareToSquareTarget)
  const showToast = useStore((s) => s.showToast)
  const drawerRef = useRef<HTMLElement>(null)
  const [query, setQuery] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  useCloseOnEscape(showPromptLibrary, () => setShowPromptLibrary(false))
  usePreventBackgroundScroll(showPromptLibrary, drawerRef)

  useEffect(() => {
    if (!showPromptLibrary) return
    setContent(prompt)
  }, [prompt, showPromptLibrary])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return promptLibrary
    return promptLibrary.filter((item) =>
      item.title.toLowerCase().includes(q) || item.content.toLowerCase().includes(q),
    )
  }, [promptLibrary, query])

  if (!showPromptLibrary) return null

  const handleSave = () => {
    const text = content.trim()
    if (!text) {
      showToast('没有可保存的提示词', 'error')
      return
    }
    savePromptToLibrary(text, title)
    setTitle('')
    showToast('已保存到提示词库', 'success')
  }

  const handleUse = (text: string) => {
    setPrompt(text)
    setShowPromptLibrary(false)
    showToast('已填入输入框', 'success')
  }

  const handleCopy = async (text: string) => {
    try {
      await copyTextToClipboard(text)
      showToast('提示词已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制失败', err), 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/30 backdrop-blur-sm" onClick={() => setShowPromptLibrary(false)}>
      <aside
        ref={drawerRef}
        className="flex h-full w-full max-w-xl flex-col overflow-hidden bg-white shadow-2xl dark:bg-gray-950"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/[0.08]">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">提示词库</h2>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">{promptLibrary.length} 条已保存</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPromptLibrary(false)}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            aria-label="关闭提示词库"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-gray-100 p-4 dark:border-white/[0.08]">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题（可选）"
            className="mb-2 h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
          />
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="保存当前输入框，或在这里写一条新提示词"
            rows={4}
            className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setContent(prompt)}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/[0.08] dark:text-gray-300 dark:hover:bg-white/[0.06]"
            >
              载入当前
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-600"
            >
              保存
            </button>
          </div>
        </div>

        <div className="border-b border-gray-100 p-4 dark:border-white/[0.08]">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索提示词"
            className="h-9 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-2xl border border-dashed border-gray-200 text-sm text-gray-400 dark:border-white/[0.08] dark:text-gray-500">
              暂无匹配的提示词
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
                  <input
                    value={item.title}
                    onChange={(e) => updatePromptLibraryItem(item.id, { title: e.target.value })}
                    className="mb-2 w-full rounded-lg bg-transparent text-sm font-semibold text-gray-800 outline-none dark:text-gray-100"
                  />
                  <textarea
                    value={item.content}
                    onChange={(e) => updatePromptLibraryItem(item.id, { content: e.target.value })}
                    rows={4}
                    className="w-full resize-none rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm leading-relaxed text-gray-700 outline-none focus:border-blue-300 dark:border-white/[0.06] dark:bg-black/20 dark:text-gray-200"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-gray-400">{formatTime(item.updatedAt)}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopy(item.content)}
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
                        title="复制"
                      >
                        <CopyIcon className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUse(item.content)}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                      >
                        使用
                      </button>
                      <button
                        type="button"
                        onClick={() => setShareToSquareTarget({ kind: 'prompt', title: item.title, content: item.content })}
                        className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-300 dark:hover:bg-indigo-500/20"
                      >
                        分享
                      </button>
                      <button
                        type="button"
                        onClick={() => deletePromptLibraryItem(item.id)}
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                        title="删除"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
