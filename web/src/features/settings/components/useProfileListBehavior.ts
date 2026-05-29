import { useCallback, useEffect, useRef, useState, type DragEvent, type TouchEvent } from 'react'
import {
  createDefaultOpenAIProfile,
  getApiProviderLabel,
  normalizeSettings,
} from '../../../lib/apiProfiles'
import { DEFAULT_DROPDOWN_MAX_HEIGHT, getDropdownMaxHeight } from '../../../lib/dropdown'
import type { ApiProfile, AppSettings } from '../../../types'
import { newId } from './profileSettingsHelpers'

type ProfileDropPosition = 'before' | 'after' | null

export type ProfileTouchDragPreview = {
  label: string
  providerLabel: string
  x: number
  y: number
  width: number
  height: number
  offsetX: number
  offsetY: number
}

export function useProfileListBehavior(input: {
  draft: AppSettings
  activeProfile: ApiProfile
  reusedTaskApiProfileId: string | null
  setReusedTaskApiProfile: (profileId: string | null, missing?: boolean, profileName?: string | null) => void
  commitSettings: (nextDraft: AppSettings) => void
  hideDuplicateTooltip: () => void
}) {
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const profileMenuTriggerRef = useRef<HTMLButtonElement>(null)
  const profileTouchDragRef = useRef<{ id: string, startX: number, startY: number, moved: boolean } | null>(null)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [profileMenuMaxHeight, setProfileMenuMaxHeight] = useState(DEFAULT_DROPDOWN_MAX_HEIGHT)
  const [draggedProfileId, setDraggedProfileId] = useState<string | null>(null)
  const [dragOverProfileId, setDragOverProfileId] = useState<string | null>(null)
  const [dragDropPosition, setDragDropPosition] = useState<ProfileDropPosition>(null)
  const [profileTouchDragPreview, setProfileTouchDragPreview] = useState<ProfileTouchDragPreview | null>(null)

  const updateProfileMenuMaxHeight = useCallback(() => {
    if (!profileMenuTriggerRef.current) return
    setProfileMenuMaxHeight(getDropdownMaxHeight(profileMenuTriggerRef.current))
  }, [])

  useEffect(() => {
    if (!showProfileMenu) return

    const handlePointerDown = (event: PointerEvent) => {
      if (profileMenuRef.current?.contains(event.target as Node)) return
      setShowProfileMenu(false)
    }

    updateProfileMenuMaxHeight()
    document.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('resize', updateProfileMenuMaxHeight)
    window.addEventListener('scroll', updateProfileMenuMaxHeight, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('resize', updateProfileMenuMaxHeight)
      window.removeEventListener('scroll', updateProfileMenuMaxHeight, true)
    }
  }, [showProfileMenu, updateProfileMenuMaxHeight])

  useEffect(() => {
    if (!profileTouchDragPreview) return

    const preventTouchScroll = (event: Event) => {
      event.preventDefault()
    }
    const listenerOptions = { passive: false, capture: true } as AddEventListenerOptions
    const previousOverflow = document.body.style.overflow
    const previousOverscroll = document.body.style.overscrollBehavior

    document.body.style.overflow = 'hidden'
    document.body.style.overscrollBehavior = 'none'
    window.addEventListener('touchmove', preventTouchScroll, listenerOptions)

    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.overscrollBehavior = previousOverscroll
      window.removeEventListener('touchmove', preventTouchScroll, listenerOptions)
    }
  }, [profileTouchDragPreview])

  const createNewProfile = () => {
    input.setReusedTaskApiProfile(null)
    const profile = createDefaultOpenAIProfile({ id: newId('openai'), name: '新配置' })
    const nextDraft = normalizeSettings({
      ...input.draft,
      profiles: [...input.draft.profiles, profile],
      activeProfileId: profile.id,
    })
    input.commitSettings(nextDraft)
    setShowProfileMenu(false)
  }

  const duplicateActiveProfile = () => {
    input.setReusedTaskApiProfile(null)
    input.hideDuplicateTooltip()
    const profile: ApiProfile = {
      ...input.activeProfile,
      id: newId(input.activeProfile.provider === 'openai' ? 'openai' : 'profile'),
      name: `${input.activeProfile.name}（复制）`,
    }
    const nextDraft = normalizeSettings({
      ...input.draft,
      profiles: [...input.draft.profiles, profile],
      activeProfileId: profile.id,
    })
    input.commitSettings(nextDraft)
    setShowProfileMenu(false)
  }

  const switchProfile = (id: string) => {
    input.setReusedTaskApiProfile(null)
    const nextDraft = normalizeSettings({ ...input.draft, activeProfileId: id })
    input.commitSettings(nextDraft)
    setShowProfileMenu(false)
  }

  const handleProfileDragStart = (event: DragEvent, id: string) => {
    setDraggedProfileId(id)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  const handleProfileDragOver = (event: DragEvent, targetId: string) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'

    const targetElement = event.currentTarget as HTMLElement
    const rect = targetElement.getBoundingClientRect()
    const position = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'

    if (dragOverProfileId !== targetId || dragDropPosition !== position) {
      setDragOverProfileId(targetId)
      setDragDropPosition(position)
    }

    const scrollContainer = targetElement.closest('.custom-scrollbar')
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const scrollThreshold = 30

      if (event.clientY < containerRect.top + scrollThreshold) {
        scrollContainer.scrollTop -= 10
      } else if (event.clientY > containerRect.bottom - scrollThreshold) {
        scrollContainer.scrollTop += 10
      }
    }
  }

  const handleProfileDragEnd = () => {
    setDraggedProfileId(null)
    setDragOverProfileId(null)
    setDragDropPosition(null)
    setProfileTouchDragPreview(null)
    profileTouchDragRef.current = null
  }

  const moveProfileToDropTarget = (sourceId: string, targetId: string, position: ProfileDropPosition) => {
    if (!sourceId || sourceId === targetId) return

    const sourceIndex = input.draft.profiles.findIndex((profile) => profile.id === sourceId)
    const targetIndex = input.draft.profiles.findIndex((profile) => profile.id === targetId)
    if (sourceIndex < 0 || targetIndex < 0) return

    const newProfiles = [...input.draft.profiles]
    const [removed] = newProfiles.splice(sourceIndex, 1)

    let newTargetIndex = targetIndex
    if (position === 'after') newTargetIndex++
    if (sourceIndex < targetIndex) newTargetIndex--

    newProfiles.splice(newTargetIndex, 0, removed)

    const nextDraft = normalizeSettings({ ...input.draft, profiles: newProfiles })
    input.commitSettings(nextDraft)
  }

  const handleProfileDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault()
    moveProfileToDropTarget(event.dataTransfer.getData('text/plain'), targetId, dragDropPosition)
    handleProfileDragEnd()
  }

  const handleProfileTouchStart = (event: TouchEvent, profile: ApiProfile) => {
    if (!(event.target as HTMLElement).closest('[data-drag-handle]')) return
    const touch = event.touches[0]
    const rect = event.currentTarget.getBoundingClientRect()

    event.preventDefault()
    event.stopPropagation()
    profileTouchDragRef.current = { id: profile.id, startX: touch.clientX, startY: touch.clientY, moved: false }
    setDraggedProfileId(profile.id)
    setProfileTouchDragPreview({
      label: profile.name,
      providerLabel: getApiProviderLabel(input.draft, profile.provider),
      x: touch.clientX,
      y: touch.clientY,
      width: rect.width,
      height: rect.height,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top,
    })
  }

  const handleProfileTouchMove = (event: TouchEvent) => {
    const drag = profileTouchDragRef.current
    if (!drag) return
    const touch = event.touches[0]

    if (!drag.moved) {
      if (Math.abs(touch.clientX - drag.startX) > 5 || Math.abs(touch.clientY - drag.startY) > 5) {
        drag.moved = true
      } else {
        return
      }
    }

    event.preventDefault()
    setProfileTouchDragPreview((current) => current ? { ...current, x: touch.clientX, y: touch.clientY } : current)

    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    const targetElement = element?.closest('[data-profile-id]') as HTMLElement | null
    if (!targetElement) return

    const targetId = targetElement.getAttribute('data-profile-id')
    if (!targetId) return

    const rect = targetElement.getBoundingClientRect()
    const position = touch.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
    setDragOverProfileId(targetId)
    setDragDropPosition(position)

    const scrollContainer = targetElement.closest('.custom-scrollbar') as HTMLElement | null
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const scrollThreshold = 30
      if (touch.clientY < containerRect.top + scrollThreshold) {
        scrollContainer.scrollTop -= 10
      } else if (touch.clientY > containerRect.bottom - scrollThreshold) {
        scrollContainer.scrollTop += 10
      }
    }
  }

  const handleProfileTouchEnd = (event: TouchEvent) => {
    const drag = profileTouchDragRef.current
    if (!drag) return
    if (drag.moved && dragOverProfileId && dragOverProfileId !== drag.id) {
      event.preventDefault()
      moveProfileToDropTarget(drag.id, dragOverProfileId, dragDropPosition)
    }
    handleProfileDragEnd()
  }

  const deleteProfile = (id: string) => {
    if (input.draft.profiles.length <= 1) return
    if (id === input.reusedTaskApiProfileId) input.setReusedTaskApiProfile(null)
    const nextProfiles = input.draft.profiles.filter((item) => item.id !== id)
    const nextDraft = normalizeSettings({
      ...input.draft,
      profiles: nextProfiles,
      activeProfileId: input.draft.activeProfileId === id ? nextProfiles[0].id : input.draft.activeProfileId,
    })
    input.commitSettings(nextDraft)
  }

  return {
    profileMenuRef,
    profileMenuTriggerRef,
    showProfileMenu,
    setShowProfileMenu,
    profileMenuMaxHeight,
    updateProfileMenuMaxHeight,
    draggedProfileId,
    dragOverProfileId,
    dragDropPosition,
    profileTouchDragPreview,
    createNewProfile,
    duplicateActiveProfile,
    switchProfile,
    handleProfileDragStart,
    handleProfileDragOver,
    handleProfileDragEnd,
    handleProfileDrop,
    handleProfileTouchStart,
    handleProfileTouchMove,
    handleProfileTouchEnd,
    deleteProfile,
  }
}
