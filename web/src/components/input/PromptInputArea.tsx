import type { ClipboardEventHandler, KeyboardEventHandler, RefObject } from 'react'
import { syncMentionTagSelection } from './contentEditableMentions'
import { type AtImageOption } from './InputBarParts'
import AtImageMenu from './AtImageMenu'
import { CloseIcon } from '../../shared/ui/icons'

type PromptInputAreaProps = {
  activeAtImageIndex: number
  atImageOptions: AtImageOption[]
  isSingleLine: boolean
  menuLeft: number
  onActiveAtImageIndexChange: (index: number) => void
  onAtImageSelect: (option: AtImageOption) => void
  onClearPrompt: () => void
  onCopy: ClipboardEventHandler<HTMLDivElement>
  onInput: (el: HTMLDivElement) => void
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  onPaste: ClipboardEventHandler<HTMLDivElement>
  onSelect: (el: HTMLDivElement) => void
  placeholder: string
  prompt: string
  showAtImageMenu: boolean
  textareaRef: RefObject<HTMLDivElement | null>
}

export default function PromptInputArea({
  activeAtImageIndex,
  atImageOptions,
  isSingleLine,
  menuLeft,
  onActiveAtImageIndexChange,
  onAtImageSelect,
  onClearPrompt,
  onCopy,
  onInput,
  onKeyDown,
  onPaste,
  onSelect,
  placeholder,
  prompt,
  showAtImageMenu,
  textareaRef,
}: PromptInputAreaProps) {
  return (
    <div className="relative grid">
      {showAtImageMenu && (
        <AtImageMenu
          activeIndex={activeAtImageIndex}
          left={menuLeft}
          options={atImageOptions}
          onSelect={onAtImageSelect}
          onActiveIndexChange={onActiveAtImageIndexChange}
        />
      )}
      <div
        ref={textareaRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onInput(e.currentTarget)}
        onSelect={(e) => onSelect(e.currentTarget)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onCopy={onCopy}
        onClick={(e) => {
          const el = textareaRef.current
          if (!el) return
          const target = e.target as HTMLElement
          if (target.classList.contains('mention-tag')) {
            const sel = window.getSelection()
            if (sel) {
              const range = document.createRange()
              range.selectNode(target)
              sel.removeAllRanges()
              sel.addRange(range)
              syncMentionTagSelection(el)
            }
            return
          }

          syncMentionTagSelection(el)
        }}
        aria-label={placeholder}
        className="col-start-1 row-start-1 min-h-[42px] w-full overflow-hidden ios-rounded-scroll-fix whitespace-pre-wrap break-words rounded-2xl border border-gray-200/60 bg-white/50 pl-4 pr-10 py-3 text-sm leading-relaxed shadow-sm outline-none transition-[border-color,box-shadow] duration-200 focus:ring-1 focus:ring-blue-300/40 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-100 dark:focus:ring-blue-500/30"
      />
      {prompt.length === 0 && (
        <div className="prompt-placeholder col-start-1 row-start-1 pointer-events-none pl-4 pr-10 py-3 text-sm leading-relaxed text-gray-400 dark:text-gray-500">
          {placeholder}
        </div>
      )}
      {prompt.length > 0 && (
        <button
          type="button"
          onClick={onClearPrompt}
          className={`absolute right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/[0.08] rounded-full p-1 transition-all duration-200 focus:outline-none z-10 flex items-center justify-center ${
            isSingleLine ? 'top-1/2 -translate-y-1/2' : 'top-3'
          }`}
          title="清空文本"
        >
          <CloseIcon className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
