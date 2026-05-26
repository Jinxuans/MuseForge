import { useCallback, useMemo, useState, type KeyboardEvent, type MutableRefObject, type RefObject } from 'react'
import type { AgentConversation, InputImage, TaskRecord } from '../../types'
import {
  getAtImageQuery,
  getImageMentionLabel,
  imageMentionMatches,
  insertImageMentionAtVisibleRange,
  insertTextMentionAtVisibleRange,
  isCursorInSelectedImageMention,
  stripImageMentionMarkers,
} from '../../lib/promptImageMentions'
import {
  getContentEditableCursor,
  getMentionTagHtml,
  setContentEditableCursor,
  setContentEditableSelection,
} from './contentEditableMentions'
import {
  agentImageMentionMatches,
  getAgentOutputImageOptions,
  type AtImageOption,
} from './InputBarParts'

type UseAtImageMentionsArgs = {
  activeAgentConversation: AgentConversation | null
  cursorPosition: number
  inputImages: InputImage[]
  isUserInputRef: MutableRefObject<boolean>
  prompt: string
  setPrompt: (prompt: string) => void
  syncPromptFromContentEditable: () => void
  tasks: TaskRecord[]
  textareaRef: RefObject<HTMLDivElement | null>
}

export function useAtImageMentions({
  activeAgentConversation,
  cursorPosition,
  inputImages,
  isUserInputRef,
  prompt,
  setPrompt,
  syncPromptFromContentEditable,
  tasks,
  textareaRef,
}: UseAtImageMentionsArgs) {
  const [atImageMenuIndex, setAtImageMenuIndex] = useState(0)
  const [atImageMenuDismissed, setAtImageMenuDismissed] = useState(false)

  const resetMentionMenu = useCallback(() => {
    setAtImageMenuIndex(0)
    setAtImageMenuDismissed(false)
  }, [])

  const agentOutputImageOptions = useMemo(
    () => getAgentOutputImageOptions(activeAgentConversation, tasks),
    [activeAgentConversation, tasks],
  )
  const atImageSourceCount = inputImages.length + agentOutputImageOptions.length
  const atImageQuery = isCursorInSelectedImageMention(prompt, cursorPosition)
    ? null
    : getAtImageQuery(stripImageMentionMarkers(prompt), cursorPosition, { length: atImageSourceCount })
  const atImageOptions = atImageQuery
    ? [
        ...inputImages
          .map((img, index) => ({
            type: 'input' as const,
            key: `input:${img.id}:${index}`,
            label: getImageMentionLabel(index),
            imageId: img.id,
            dataUrl: img.dataUrl,
            imageIndex: index,
          }))
          .filter((option) => imageMentionMatches(atImageQuery.query, option.imageIndex)),
        ...agentOutputImageOptions.filter((option) => agentImageMentionMatches(atImageQuery.query, option.label)),
      ]
    : []
  const showAtImageMenu = !atImageMenuDismissed && atImageOptions.length > 0

  const insertInputImageMention = useCallback((idx: number) => {
    const el = textareaRef.current
    const cursor = el ? getContentEditableCursor(el) : prompt.length
    if (el) {
      el.focus()
      setContentEditableCursor(el, cursor)
      if (document.execCommand('insertHTML', false, getMentionTagHtml(getImageMentionLabel(idx)))) {
        syncPromptFromContentEditable()
        return
      }
    }

    const next = insertImageMentionAtVisibleRange(prompt, cursor, cursor, idx)
    isUserInputRef.current = false
    setPrompt(next.prompt)
    window.setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        setContentEditableCursor(textareaRef.current, next.cursor)
      }
    }, 0)
  }, [isUserInputRef, prompt, setPrompt, syncPromptFromContentEditable, textareaRef])

  const selectAtImageOption = useCallback((option: AtImageOption) => {
    const el = textareaRef.current
    const cursor = el ? getContentEditableCursor(el) : prompt.length
    const query = getAtImageQuery(stripImageMentionMarkers(prompt), cursor, { length: atImageSourceCount })
    setAtImageMenuDismissed(true)
    setAtImageMenuIndex(0)
    if (!query) return

    const mentionText = option.type === 'input' ? getImageMentionLabel(option.imageIndex) : option.insertText
    const nextCursor = query.start + mentionText.length
    if (el) {
      el.focus()
      setContentEditableSelection(el, query.start, cursor)
      if (document.execCommand('insertHTML', false, getMentionTagHtml(mentionText))) {
        setContentEditableCursor(el, nextCursor)
        syncPromptFromContentEditable()
        return
      }
    }

    const next = option.type === 'input'
      ? insertImageMentionAtVisibleRange(prompt, query.start, cursor, option.imageIndex)
      : insertTextMentionAtVisibleRange(prompt, query.start, cursor, option.insertText)
    isUserInputRef.current = false
    setPrompt(next.prompt)
    window.setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        setContentEditableCursor(textareaRef.current, next.cursor)
      }
    }, 0)
  }, [atImageSourceCount, isUserInputRef, prompt, setPrompt, syncPromptFromContentEditable, textareaRef])

  const handleAtImageKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!showAtImageMenu) return false

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtImageMenuIndex((idx) => (idx + 1) % atImageOptions.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtImageMenuIndex((idx) => (idx - 1 + atImageOptions.length) % atImageOptions.length)
      return true
    }
    if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
      e.preventDefault()
      selectAtImageOption(atImageOptions[atImageMenuIndex] ?? atImageOptions[0])
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setAtImageMenuIndex(0)
      textareaRef.current?.blur()
      return true
    }

    return false
  }, [atImageMenuIndex, atImageOptions, selectAtImageOption, showAtImageMenu, textareaRef])

  return {
    atImageMenuIndex,
    atImageOptions,
    handleAtImageKeyDown,
    insertInputImageMention,
    resetMentionMenu,
    selectAtImageOption,
    setAtImageMenuIndex,
    showAtImageMenu,
  }
}
