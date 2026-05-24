import { lazy, Suspense, useEffect } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { buildSettingsFromUrlParams, clearUrlSettingParams, hasUrlSettingParams } from './lib/urlSettings'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import ImageContextMenu from './components/ImageContextMenu'
import TaskContextMenu from './components/TaskContextMenu'
import { useGlobalClickSuppression } from './lib/clickSuppression'

const AgentWorkspace = lazy(() => import('./components/AgentWorkspace'))
const SquarePage = lazy(() => import('./components/SquarePage'))
const DetailModal = lazy(() => import('./components/DetailModal'))
const Lightbox = lazy(() => import('./components/Lightbox'))
const SettingsModal = lazy(() => import('./components/SettingsModal'))
const MaskEditorModal = lazy(() => import('./components/MaskEditorModal'))
const ShareToSquareModal = lazy(() => import('./components/ShareToSquareModal'))
const SupportPromptModal = lazy(() => import('./components/SupportPromptModal'))
const PromptLibraryDrawer = lazy(() => import('./components/PromptLibraryDrawer'))
const MoveCategoryModal = lazy(() => import('./components/MoveCategoryModal'))

function AppModeFallback() {
  return (
    <main className="pb-48">
      <div className="safe-area-x mx-auto max-w-7xl pt-8 text-sm text-gray-400 dark:text-gray-500">
        加载中...
      </div>
    </main>
  )
}

export default function App() {
  const setSettings = useStore((s) => s.setSettings)
  const appMode = useStore((s) => s.appMode)
  const detailTaskId = useStore((s) => s.detailTaskId)
  const lightboxImageId = useStore((s) => s.lightboxImageId)
  const showSettings = useStore((s) => s.showSettings)
  const supportPromptOpen = useStore((s) => s.supportPromptOpen)
  const shareToSquareTarget = useStore((s) => s.shareToSquareTarget)
  const showPromptLibrary = useStore((s) => s.showPromptLibrary)
  const moveCategoryTaskIds = useStore((s) => s.moveCategoryTaskIds)
  const maskEditorImageId = useStore((s) => s.maskEditorImageId)
  useDockerApiUrlMigrationNotice()
  useGlobalClickSuppression()

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const nextSettings = buildSettingsFromUrlParams(useStore.getState().settings, searchParams)

    setSettings(nextSettings)

    if (hasUrlSettingParams(searchParams)) {
      clearUrlSettingParams(searchParams)

      const nextSearch = searchParams.toString()
      const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`
      window.history.replaceState(null, '', nextUrl)
    }

    initStore()
  }, [setSettings])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header />
      <Suspense fallback={<AppModeFallback />}>
        {appMode === 'agent' ? (
          <AgentWorkspace />
        ) : appMode === 'square' ? (
          <SquarePage />
        ) : (
          <main data-home-main data-drag-select-surface className="pb-48">
            <div className="safe-area-x max-w-7xl mx-auto">
              <SearchBar />
              <TaskGrid />
            </div>
          </main>
        )}
      </Suspense>
      {appMode !== 'square' && <InputBar />}
      <Suspense fallback={null}>
        {detailTaskId && <DetailModal />}
        {lightboxImageId && <Lightbox />}
        {showSettings && <SettingsModal />}
        {supportPromptOpen && <SupportPromptModal />}
        {shareToSquareTarget && <ShareToSquareModal />}
        {showPromptLibrary && <PromptLibraryDrawer />}
        {moveCategoryTaskIds?.length ? <MoveCategoryModal /> : null}
        {maskEditorImageId && <MaskEditorModal />}
      </Suspense>
      <ConfirmDialog />
      <Toast />
      <ImageContextMenu />
      <TaskContextMenu />
    </>
  )
}
