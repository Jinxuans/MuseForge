import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type RefObject } from 'react'
import type { InputImage, MaskDraft } from '../../types'
import { getPromptIndexFromVisibleIndex, getPromptMentionParts, getSelectedImageMentionLabel, stripImageMentionMarkers } from '../../lib/promptImageMentions'
import {
  getContentEditablePlainText,
  getContentEditableSelection,
  getSelectedPromptText,
  setContentEditableCursor,
  syncMentionTagSelection,
} from './contentEditableMentions'

type UsePromptEditorArgs = {
  imagesRef: RefObject<HTMLElement | null>
  inputImages: InputImage[]
  maskDraft: MaskDraft | null
  maskPreviewUrl: string
  prompt: string
  resetMentionMenu: () => void
  setPrompt: (prompt: string) => void
  textareaRef: RefObject<HTMLDivElement | null>
}

function escapeMentionText(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function usePromptEditor({
  imagesRef,
  inputImages,
  maskDraft,
  maskPreviewUrl,
  prompt,
  resetMentionMenu,
  setPrompt,
  textareaRef,
}: UsePromptEditorArgs) {
  const prevHeightRef = useRef(42)
  const isUserInputRef = useRef(false)
  const [cursorPos, setCursorPos] = useState(0)
  const [isSingleLine, setIsSingleLine] = useState(true)
  const [menuLeft, setMenuLeft] = useState(0)

  const syncPromptFromContentEditable = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    isUserInputRef.current = true
    const range = getContentEditableSelection(el)
    setCursorPos(range.start)
    syncMentionTagSelection(el)
    setPrompt(getContentEditablePlainText(el))
  }, [setPrompt, textareaRef])

  const insertPromptTextAtSelection = useCallback((text: string) => {
    const el = textareaRef.current
    if (el) {
      el.focus()
      if (document.execCommand('insertText', false, text)) {
        syncPromptFromContentEditable()
        return
      }
    }

    const selection = el ? getContentEditableSelection(el) : { start: prompt.length, end: prompt.length }
    const promptStart = getPromptIndexFromVisibleIndex(prompt, selection.start)
    const promptEnd = getPromptIndexFromVisibleIndex(prompt, selection.end)
    const nextPrompt = `${prompt.slice(0, promptStart)}${text}${prompt.slice(promptEnd)}`
    const nextCursor = selection.start + text.length
    isUserInputRef.current = false
    setPrompt(nextPrompt)
    window.setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        setContentEditableCursor(textareaRef.current, nextCursor)
      }
    }, 0)
  }, [prompt, setPrompt, syncPromptFromContentEditable, textareaRef])

  const handleClearPrompt = useCallback(() => {
    isUserInputRef.current = false
    setPrompt('')
    if (textareaRef.current) {
      textareaRef.current.innerHTML = ''
      textareaRef.current.focus()
    }
  }, [setPrompt, textareaRef])

  const handleInput = useCallback((el: HTMLDivElement) => {
    isUserInputRef.current = true
    const range = getContentEditableSelection(el)
    setCursorPos(range.start)
    syncMentionTagSelection(el)
    setPrompt(getContentEditablePlainText(el))
    resetMentionMenu()
  }, [resetMentionMenu, setPrompt])

  const handleSelect = useCallback((el: HTMLDivElement) => {
    const range = getContentEditableSelection(el)
    setCursorPos(range.start)
    syncMentionTagSelection(el)
    resetMentionMenu()
  }, [resetMentionMenu])

  const handlePromptPaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    if (Array.from(e.clipboardData.items).some((item) => item.type.startsWith('image/'))) return

    e.preventDefault()
    insertPromptTextAtSelection(text.replace(/\r\n?/g, '\n'))
  }, [insertPromptTextAtSelection])

  const handlePromptCopy = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    const el = textareaRef.current
    if (!el) return

    const text = getSelectedPromptText(el, prompt)
    if (text == null) return
    const copyText = /^\s*@图\d+\s*$/.test(text) ? text.trim() : text

    e.preventDefault()
    e.clipboardData.setData('text/plain', copyText)
  }, [prompt, textareaRef])

  const adjustTextareaHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return

    const imagesHeight = imagesRef.current?.offsetHeight ?? 0
    const fixedOverhead = imagesHeight + 140
    const maxH = Math.max(window.innerHeight * 0.4 - fixedOverhead, 80)

    el.style.transition = 'none'
    el.style.height = '0'
    el.style.overflowY = 'hidden'
    const scrollH = el.scrollHeight

    const placeholderEl = el.parentElement?.querySelector('.prompt-placeholder')
    const placeholderH = placeholderEl ? placeholderEl.scrollHeight : 0
    const minH = Math.max(42, placeholderH)

    const desired = Math.max(scrollH, minH)
    const targetH = desired > maxH ? maxH : desired
    setIsSingleLine(desired <= minH)

    el.style.height = `${prevHeightRef.current}px`
    void el.offsetHeight

    el.style.transition = 'height 150ms ease, border-color 200ms, box-shadow 200ms'
    el.style.height = `${targetH}px`
    el.style.overflowY = desired > maxH ? 'auto' : 'hidden'

    prevHeightRef.current = targetH
  }, [imagesRef, textareaRef])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (isUserInputRef.current) {
      isUserInputRef.current = false
      return
    }
    const parts = getPromptMentionParts(prompt, inputImages)
    const html = prompt
      ? parts.map((part) =>
          part.type === 'mention'
            ? `<span contenteditable="false" class="mention-tag" data-mention-text="${part.mentionText ?? getSelectedImageMentionLabel(part.imageIndex ?? 0)}">${part.text}</span>`
            : escapeMentionText(part.text)
        ).join('')
      : ''
    if (el.innerHTML !== html) {
      el.innerHTML = html
    }
  }, [inputImages, prompt, textareaRef])

  useEffect(() => {
    adjustTextareaHeight()
  }, [adjustTextareaHeight, inputImages, prompt])

  useEffect(() => {
    const handleSelectionChange = () => {
      const el = textareaRef.current
      if (!el) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0) return

      const domRange = sel.getRangeAt(0)
      try {
        if (!domRange.intersectsNode(el)) {
          syncMentionTagSelection(el)
          return
        }
      } catch {
        return
      }

      const range = getContentEditableSelection(el)
      setCursorPos(range.start)
      syncMentionTagSelection(el)

      const rangeRect = domRange.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      if (rangeRect.width === 0 && rangeRect.height === 0) return
      setMenuLeft(rangeRect.left - elRect.left)
    }
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => document.removeEventListener('selectionchange', handleSelectionChange)
  }, [textareaRef])

  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return

      if (document.activeElement instanceof HTMLElement) {
        if (document.activeElement.closest('[data-input-bar]') && !target.closest('[data-input-bar]')) {
          document.activeElement.blur()
        }
      }
    }

    document.addEventListener('mousedown', handleGlobalMouseDown, true)
    return () => {
      document.removeEventListener('mousedown', handleGlobalMouseDown, true)
    }
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [adjustTextareaHeight, inputImages.length, Boolean(maskDraft), maskPreviewUrl])

  useEffect(() => {
    window.addEventListener('resize', adjustTextareaHeight)
    return () => window.removeEventListener('resize', adjustTextareaHeight)
  }, [adjustTextareaHeight])

  return {
    cursorPos,
    handleClearPrompt,
    handleInput,
    handlePromptCopy,
    handlePromptPaste,
    handleSelect,
    insertPromptTextAtSelection,
    isSingleLine,
    isUserInputRef,
    menuLeft,
    syncPromptFromContentEditable,
  }
}
