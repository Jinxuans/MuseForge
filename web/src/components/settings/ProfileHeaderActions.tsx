import type { ApiProfile } from '../../types'
import ViewportTooltip from '../ViewportTooltip'
import { CopyIcon, LinkIcon } from '../icons'

type ProfileHeaderActionsProps = {
  activeProfile: ApiProfile
  profileImportUrlTooltipVisible: boolean
  duplicateProfileTooltipVisible: boolean
  onCopyProfileImportUrl: (profile: ApiProfile) => void
  onDuplicateActiveProfile: () => void
  onProfileImportUrlTooltipVisibleChange: (visible: boolean) => void
  onDuplicateProfileTooltipVisibleChange: (visible: boolean) => void
  onStartProfileImportUrlTooltipTouch: () => void
  onClearProfileImportUrlTooltipTimer: () => void
  onStartDuplicateProfileTooltipTouch: () => void
  onClearDuplicateProfileTooltipTimer: () => void
}

export default function ProfileHeaderActions({
  activeProfile,
  profileImportUrlTooltipVisible,
  duplicateProfileTooltipVisible,
  onCopyProfileImportUrl,
  onDuplicateActiveProfile,
  onProfileImportUrlTooltipVisibleChange,
  onDuplicateProfileTooltipVisibleChange,
  onStartProfileImportUrlTooltipTouch,
  onClearProfileImportUrlTooltipTimer,
  onStartDuplicateProfileTooltipTouch,
  onClearDuplicateProfileTooltipTimer,
}: ProfileHeaderActionsProps) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="block text-sm text-gray-600 dark:text-gray-300">当前配置</span>
      <span className="relative inline-flex">
        <button
          type="button"
          onClick={() => onCopyProfileImportUrl(activeProfile)}
          onMouseEnter={() => onProfileImportUrlTooltipVisibleChange(true)}
          onMouseLeave={() => onProfileImportUrlTooltipVisibleChange(false)}
          onFocus={() => onProfileImportUrlTooltipVisibleChange(true)}
          onBlur={() => onProfileImportUrlTooltipVisibleChange(false)}
          onTouchStart={onStartProfileImportUrlTooltipTouch}
          onTouchEnd={onClearProfileImportUrlTooltipTimer}
          onTouchCancel={onClearProfileImportUrlTooltipTimer}
          className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
          aria-label={`复制导入配置「${activeProfile.name}」的 URL`}
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </button>
        <ViewportTooltip visible={profileImportUrlTooltipVisible} className="whitespace-nowrap">
          复制导入 URL
        </ViewportTooltip>
      </span>
      <span className="relative inline-flex">
        <button
          type="button"
          onClick={onDuplicateActiveProfile}
          onMouseEnter={() => onDuplicateProfileTooltipVisibleChange(true)}
          onMouseLeave={() => onDuplicateProfileTooltipVisibleChange(false)}
          onFocus={() => onDuplicateProfileTooltipVisibleChange(true)}
          onBlur={() => onDuplicateProfileTooltipVisibleChange(false)}
          onTouchStart={onStartDuplicateProfileTooltipTouch}
          onTouchEnd={onClearDuplicateProfileTooltipTimer}
          onTouchCancel={onClearDuplicateProfileTooltipTimer}
          className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
          aria-label={`复制一份配置「${activeProfile.name}」`}
        >
          <CopyIcon className="h-3.5 w-3.5" />
        </button>
        <ViewportTooltip visible={duplicateProfileTooltipVisible} className="whitespace-nowrap">
          复制当前配置
        </ViewportTooltip>
      </span>
    </div>
  )
}
