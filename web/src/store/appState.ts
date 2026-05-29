import type {
  AgentConversation,
  AppMode,
  AppSettings,
  CategoryConfig,
  InputImage,
  MaskDraft,
  PromptLibraryItem,
  SquareShareTarget,
  TaskParams,
  TaskRecord,
  TaskView,
} from '../types'
import type { AgentInputDraft } from './agent/agentInputDrafts'
import type { ToastType } from './errorMessages'

export type SettingsTab = 'general' | 'agent' | 'api' | 'data' | 'about'

export interface AppModeState {
  appMode: AppMode
  setAppMode: (mode: AppMode) => void
}

export interface SettingsState {
  settings: AppSettings
  setSettings: (s: Partial<AppSettings>) => void
  dismissedCodexCliPrompts: string[]
  dismissCodexCliPrompt: (key: string) => void
}

export interface InputState {
  prompt: string
  setPrompt: (p: string) => void
  inputImages: InputImage[]
  addInputImage: (img: InputImage) => void
  replaceInputImage: (idx: number, img: InputImage) => void
  removeInputImage: (idx: number) => void
  clearInputImages: () => void
  setInputImages: (imgs: InputImage[], options?: { equivalentImageIds?: Record<string, string> }) => void
  moveInputImage: (fromIdx: number, toIdx: number) => void
  maskDraft: MaskDraft | null
  setMaskDraft: (draft: MaskDraft | null) => void
  clearMaskDraft: () => void
  maskEditorImageId: string | null
  setMaskEditorImageId: (id: string | null) => void
  galleryInputDraft: AgentInputDraft | null
}

export interface TaskParamState {
  params: TaskParams
  setParams: (p: Partial<TaskParams>) => void
  reusedTaskApiProfileId: string | null
  reusedTaskApiProfileName: string | null
  reusedTaskApiProfileMissing: boolean
  setReusedTaskApiProfile: (profileId: string | null, missing?: boolean, profileName?: string | null) => void
}

export interface AgentConversationState {
  agentConversations: AgentConversation[]
  agentConversationsLoaded: boolean
  activeAgentConversationId: string | null
  agentInputDrafts: Record<string, AgentInputDraft>
  agentSidebarCollapsed: boolean
  agentAssetTab: 'references' | 'outputs'
  agentAssetPanelCollapsed: boolean
  agentMobileHeaderVisible: boolean
  agentEditingRoundId: string | null
  agentEditingConversationId: string | null
  agentGeneratingTitleIds: Record<string, true>
  createAgentConversation: () => string
  setActiveAgentConversationId: (id: string | null) => void
  setActiveAgentRoundId: (conversationId: string, roundId: string | null) => void
  renameAgentConversation: (id: string, title: string) => void
  deleteAgentConversation: (id: string) => void
  setAgentSidebarCollapsed: (collapsed: boolean) => void
  setAgentAssetTab: (tab: 'references' | 'outputs') => void
  setAgentAssetPanelCollapsed: (collapsed: boolean) => void
  setAgentMobileHeaderVisible: (visible: boolean) => void
  setAgentEditingRoundId: (id: string | null) => void
  setAgentEditingConversationId: (id: string | null) => void
}

export interface TaskListState {
  tasks: TaskRecord[]
  setTasks: (t: TaskRecord[]) => void
  streamPreviews: Record<string, string>
  streamPreviewSlots: Record<string, Record<string, string>>
  setTaskStreamPreview: (taskId: string, image?: string, requestIndex?: number) => void
}

export interface CollectionState {
  searchQuery: string
  setSearchQuery: (q: string) => void
  filterStatus: 'all' | 'running' | 'done' | 'error'
  setFilterStatus: (status: AppState['filterStatus']) => void
  filterFavorite: boolean
  setFilterFavorite: (f: boolean) => void
  taskView: TaskView
  setTaskView: (view: TaskView) => void
  categories: CategoryConfig[]
  activeCategoryId: string
  setActiveCategoryId: (id: string) => void
  addCategory: (name: string) => string | null
  renameCategory: (id: string, name: string) => void
  deleteCategory: (id: string) => void
  moveCategoryTaskIds: string[] | null
  setMoveCategoryTaskIds: (ids: string[] | null) => void
}

export interface PromptLibraryState {
  promptLibrary: PromptLibraryItem[]
  showPromptLibrary: boolean
  setShowPromptLibrary: (show: boolean) => void
  savePromptToLibrary: (content: string, title?: string) => void
  updatePromptLibraryItem: (id: string, patch: Partial<Pick<PromptLibraryItem, 'title' | 'content'>>) => void
  deletePromptLibraryItem: (id: string) => void
  shareToSquareTarget: SquareShareTarget | null
  setShareToSquareTarget: (target: SquareShareTarget | null) => void
}

export interface SelectionState {
  selectedTaskIds: string[]
  setSelectedTaskIds: (ids: string[] | ((prev: string[]) => string[])) => void
  toggleTaskSelection: (id: string, force?: boolean) => void
  clearSelection: () => void
}

export interface UiState {
  detailTaskId: string | null
  setDetailTaskId: (id: string | null) => void
  lightboxImageId: string | null
  lightboxImageList: string[]
  setLightboxImageId: (id: string | null, list?: string[]) => void
  showSettings: boolean
  settingsTabRequest: SettingsTab | null
  setShowSettings: (v: boolean, tab?: SettingsTab) => void
  supportPromptOpen: boolean
  supportPromptDismissed: boolean
  supportPromptSkippedForImportedData: boolean
  setSupportPromptOpen: (v: boolean) => void
  dismissSupportPrompt: () => void
}

export interface ToastState {
  toast: { message: string; type: ToastType } | null
  showToast: (message: string, type?: ToastType) => void
}

export interface ConfirmDialogState {
  confirmDialog: {
    title: string
    message: string
    checkbox?: {
      label: string
      defaultChecked?: boolean
      disabled?: boolean
      tone?: 'primary' | 'danger'
    }
    confirmText?: string
    cancelText?: string
    showCancel?: boolean
    buttons?: Array<{
      label: string
      tone?: 'primary' | 'secondary' | 'danger' | 'warning'
      action: (checkboxChecked?: boolean) => void
    }>
    icon?: 'info' | 'copy'
    minConfirmDelayMs?: number
    messageAlign?: 'left' | 'center'
    tone?: 'danger' | 'warning'
    action?: (checkboxChecked?: boolean) => void
    cancelAction?: (checkboxChecked?: boolean) => void
  } | null
  setConfirmDialog: (d: AppState['confirmDialog']) => void
}

export interface AppState extends
  AppModeState,
  SettingsState,
  InputState,
  TaskParamState,
  AgentConversationState,
  TaskListState,
  CollectionState,
  PromptLibraryState,
  SelectionState,
  UiState,
  ToastState,
  ConfirmDialogState {}
