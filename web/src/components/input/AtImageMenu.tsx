import { AtImageOptionThumb, type AtImageOption } from './InputBarParts'

type AtImageMenuProps = {
  activeIndex: number
  left: number
  options: AtImageOption[]
  onSelect: (option: AtImageOption) => void
  onActiveIndexChange: (index: number) => void
}

export default function AtImageMenu({
  activeIndex,
  left,
  options,
  onSelect,
  onActiveIndexChange,
}: AtImageMenuProps) {
  return (
    <div style={{ left: `${left}px` }} className="absolute bottom-full z-50 mb-2 w-64 overflow-hidden rounded-2xl border border-gray-200/70 bg-white/95 p-1.5 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
      <div className="px-2 pb-1 pt-0.5 text-[11px] text-gray-400 dark:text-gray-500">选择图片引用</div>
      <div className="max-h-56 overflow-y-auto custom-scrollbar">
        {options.map((option, optionIndex) => (
          <button
            key={option.key}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(option)
            }}
            onMouseEnter={() => onActiveIndexChange(optionIndex)}
            className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs transition-colors ${
              optionIndex === activeIndex
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
                : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]'
            }`}
          >
            <AtImageOptionThumb option={option} />
            <span className="min-w-0 flex-1 truncate font-medium">{option.label}</span>
            {option.type === 'agent-output' && <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.06] dark:text-gray-400">历史</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
