import type { CategoryConfig, PromptLibraryItem } from '../types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function createPromptLibraryTitle(content: string) {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? '未命名提示词'
  const chars = Array.from(firstLine)
  return chars.length > 28 ? `${chars.slice(0, 25).join('')}...` : firstLine
}

export function normalizeCategories(value: unknown, uncategorizedCategoryId: string): CategoryConfig[] {
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  return value
    .map((item): CategoryConfig | null => {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string') return null
      const id = item.id.trim()
      if (!id || id === uncategorizedCategoryId || used.has(id)) return null
      used.add(id)
      return {
        id,
        name: item.name.trim() || '未命名分类',
        createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      }
    })
    .filter((item): item is CategoryConfig => item != null)
}

export function normalizePromptLibrary(value: unknown): PromptLibraryItem[] {
  if (!Array.isArray(value)) return []
  const used = new Set<string>()
  return value
    .map((item): PromptLibraryItem | null => {
      if (!isRecord(item) || typeof item.id !== 'string' || !item.id || typeof item.content !== 'string') return null
      const id = item.id.trim()
      if (!id || used.has(id)) return null
      used.add(id)
      const content = item.content.trim()
      if (!content) return null
      const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now()
      return {
        id,
        title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : createPromptLibraryTitle(content),
        content,
        createdAt,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : createdAt,
      }
    })
    .filter((item): item is PromptLibraryItem => item != null)
}

export function mergeCategoryLists(existing: CategoryConfig[], imported: unknown, uncategorizedCategoryId: string) {
  return normalizeCategories([...existing, ...normalizeCategories(imported, uncategorizedCategoryId)], uncategorizedCategoryId)
}

export function mergePromptLibraryLists(existing: PromptLibraryItem[], imported: unknown) {
  return normalizePromptLibrary([...normalizePromptLibrary(imported), ...existing])
}

export function createCategoryListItem(id: string, name: string, now = Date.now()): CategoryConfig | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  return { id, name: trimmed, createdAt: now }
}

export function addCategoryToList(categories: CategoryConfig[], category: CategoryConfig) {
  return [...categories, category]
}

export function renameCategoryInList(categories: CategoryConfig[], categoryId: string, name: string) {
  return categories.map((category) => category.id === categoryId ? { ...category, name } : category)
}

export function deleteCategoryFromList(categories: CategoryConfig[], categoryId: string) {
  return categories.filter((category) => category.id !== categoryId)
}

export function getActiveCategoryAfterDelete(activeCategoryId: string, deletedCategoryId: string) {
  return activeCategoryId === deletedCategoryId ? 'all' : activeCategoryId
}

export function createPromptLibraryItem(id: string, content: string, title?: string, now = Date.now()): PromptLibraryItem | null {
  const trimmed = content.trim()
  if (!trimmed) return null
  return {
    id,
    title: title?.trim() || createPromptLibraryTitle(trimmed),
    content: trimmed,
    createdAt: now,
    updatedAt: now,
  }
}

export function addPromptLibraryItem(promptLibrary: PromptLibraryItem[], item: PromptLibraryItem) {
  return [item, ...promptLibrary]
}

export function updatePromptLibraryItemInList(
  promptLibrary: PromptLibraryItem[],
  id: string,
  patch: Partial<Pick<PromptLibraryItem, 'title' | 'content'>>,
  now = Date.now(),
) {
  return promptLibrary.map((item) => item.id === id
    ? {
        ...item,
        ...(patch.title !== undefined ? { title: patch.title.trim() || createPromptLibraryTitle(patch.content ?? item.content) } : {}),
        ...(patch.content !== undefined ? { content: patch.content } : {}),
        updatedAt: now,
      }
    : item,
  )
}

export function deletePromptLibraryItemFromList(promptLibrary: PromptLibraryItem[], id: string) {
  return promptLibrary.filter((item) => item.id !== id)
}
