import { DEFAULT_PARAMS } from '../../types'
import type { InputImage, TaskRecord } from '../../types'
import { DEFAULT_SETTINGS, mergeImportedSettings } from '../../lib/apiProfiles'
import {
  clearLocalDataStorage,
  createExportDataZip,
  importDataFromZip,
  type ClearDataOptions,
  type DataImportOptions,
  type ExportOptions,
} from '../../services/dataPortability'
import { createStoredInputImageFromFile, createStoredInputImageFromUrl } from '../images/fileData'
import { mergeImportedAgentConversations } from '../agent/agentConversationPersistence'
import { mergeCategoryLists, mergePromptLibraryLists } from '../collection/userCollectionNormalizers'
import type { AppState } from '../appState'

export type ClearOptions = ClearDataOptions
export type ImportOptions = DataImportOptions

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

type DataPortabilityState = Pick<
  AppState,
  | 'setTasks'
  | 'clearInputImages'
  | 'clearMaskDraft'
  | 'setSettings'
  | 'setParams'
  | 'showToast'
  | 'settings'
  | 'agentConversations'
  | 'categories'
  | 'promptLibrary'
  | 'addInputImage'
>

type DataPortabilityActionsDeps = {
  getState: () => DataPortabilityState
  setState: StoreSetState
  putTask: (task: TaskRecord) => Promise<unknown>
  replaceStoredAgentConversations: (conversations: AppState['agentConversations']) => Promise<void>
  scheduleThumbnailBackfill: (imageIds: string[]) => void
  skipSupportPromptForImportedData: (tasks: TaskRecord[]) => void
  uncategorizedCategoryId: string
}

export function createDataPortabilityActions({
  getState,
  setState,
  putTask,
  replaceStoredAgentConversations,
  scheduleThumbnailBackfill,
  skipSupportPromptForImportedData,
  uncategorizedCategoryId,
}: DataPortabilityActionsDeps) {
  async function createInputImageFromFile(file: File): Promise<InputImage | null> {
    return createStoredInputImageFromFile(file)
  }

  return {
    async clearData(options: ClearOptions = { clearConfig: true, clearTasks: true }) {
      const { setTasks, clearInputImages, clearMaskDraft, setSettings, setParams, showToast } = getState()

      if (options.clearTasks) {
        await clearLocalDataStorage(options)
        setTasks([])
        setState({
          agentConversations: [],
          activeAgentConversationId: null,
          categories: [],
          activeCategoryId: 'all',
          taskView: 'gallery',
          supportPromptOpen: false,
          supportPromptSkippedForImportedData: false,
          moveCategoryTaskIds: null,
        })
        clearInputImages()
        clearMaskDraft()
      }

      if (options.clearConfig) {
        setState({ dismissedCodexCliPrompts: [], promptLibrary: [], supportPromptDismissed: false })
        setSettings({ ...DEFAULT_SETTINGS })
        setParams({ ...DEFAULT_PARAMS })
      }

      showToast('所选数据已清空', 'success')
    },

    async exportData(options: ExportOptions = { exportConfig: true, exportTasks: true }) {
      try {
        const { settings, agentConversations, categories, promptLibrary } = getState()
        const { blob, fileName } = await createExportDataZip({ settings, agentConversations, categories, promptLibrary }, options)
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName
        a.click()
        URL.revokeObjectURL(url)
        getState().showToast('数据已导出', 'success')
      } catch (e) {
        getState().showToast(`导出失败：${e instanceof Error ? e.message : String(e)}`, 'error')
      }
    },

    async importData(file: File, options: ImportOptions = { importConfig: true, importTasks: true }): Promise<boolean> {
      try {
        const { data, tasks, importedAgentConversations, importedImageIds } = await importDataFromZip(file, options, putTask)

        if (options.importTasks && data.tasks) {
          getState().setTasks(tasks)
          setState((state) => {
            const agentConversations = mergeImportedAgentConversations(state.agentConversations, importedAgentConversations)
            const activeAgentConversationId = state.activeAgentConversationId && agentConversations.some((conversation) => conversation.id === state.activeAgentConversationId)
              ? state.activeAgentConversationId
              : importedAgentConversations[0]?.id ?? agentConversations[0]?.id ?? null
            return {
              agentConversations,
              activeAgentConversationId,
            }
          })
          await replaceStoredAgentConversations(getState().agentConversations)
          skipSupportPromptForImportedData(tasks)
          scheduleThumbnailBackfill(importedImageIds)
        }

        if (options.importConfig && data.settings) {
          const state = getState()
          state.setSettings(mergeImportedSettings(state.settings, data.settings))
        }

        if (options.importConfig || options.importTasks) {
          setState((state) => ({
            categories: mergeCategoryLists(state.categories ?? [], data.categories ?? [], uncategorizedCategoryId),
            promptLibrary: mergePromptLibraryLists(state.promptLibrary, data.promptLibrary ?? []),
          }))
        }

        let msg = '数据已成功导入'
        if (options.importTasks && data.tasks) {
          msg = `已导入 ${data.tasks.length} 条记录`
        } else if (options.importConfig && data.settings) {
          msg = '配置已成功导入'
        }

        getState().showToast(msg, 'success')
        return true
      } catch (e) {
        getState().showToast(`导入失败：${e instanceof Error ? e.message : String(e)}`, 'error')
        return false
      }
    },

    async addImageFromFile(file: File): Promise<void> {
      const image = await createInputImageFromFile(file)
      if (!image) return
      getState().addInputImage(image)
    },

    createInputImageFromFile,

    async addImageFromUrl(src: string): Promise<void> {
      getState().addInputImage(await createStoredInputImageFromUrl(src))
    },
  }
}
