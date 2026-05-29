import type { ReactNode } from 'react'
import type { SettingsTab } from '../../../store'
import { ClockIcon, DatabaseIcon, InfoCircleIcon, KeyIcon, RobotIcon } from '../../../shared/ui/icons'

type SettingsSidebarProps = {
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

const tabs: Array<{ id: SettingsTab; label: string; icon: ReactNode }> = [
  {
    id: 'api',
    label: 'API 配置',
    icon: <KeyIcon className="h-4 w-4" />,
  },
  {
    id: 'general',
    label: '习惯配置',
    icon: <ClockIcon className="h-4 w-4" />,
  },
  {
    id: 'agent',
    label: 'Agent 配置',
    icon: <RobotIcon className="h-4 w-4" />,
  },
  {
    id: 'data',
    label: '数据管理',
    icon: <DatabaseIcon className="h-4 w-4" />,
  },
  {
    id: 'about',
    label: '关于',
    icon: <InfoCircleIcon className="h-4 w-4" />,
  },
]

export default function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  return (
    <div className="flex w-full shrink-0 flex-col border-b border-gray-100 bg-gray-50/50 dark:border-white/[0.08] dark:bg-white/[0.02] sm:w-48 sm:border-b-0 sm:border-r">
      <nav className="custom-scrollbar flex flex-1 space-x-1 overflow-x-auto p-3 sm:flex-col sm:space-x-0 sm:space-y-1 sm:overflow-y-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition-colors ${
              activeTab === tab.id
                ? 'bg-white font-medium text-blue-600 shadow-sm dark:bg-white/[0.08] dark:text-blue-400'
                : 'text-gray-600 hover:bg-gray-100/80 dark:text-gray-400 dark:hover:bg-white/[0.04]'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
