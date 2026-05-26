import { useCallback, useRef, type ChangeEvent, type RefObject } from 'react'
import type { AppSettings, InputImage } from '../../types'
import { addImageFromFile, createInputImageFromFile, deleteImageIfUnreferenced, useStore } from '../../store'
import type { AppState } from '../../store/appState'
import { useGlobalInputImageDropPaste } from './InputBarParts'

type ConfirmDialog = Parameters<AppState['setConfirmDialog']>[0]

type UseInputImageFilesArgs = {
  addInputImage: (image: InputImage) => void
  inputImages: InputImage[]
  maxImages: number
  replaceFileInputRef: RefObject<HTMLInputElement | null>
  replaceInputImage: (idx: number, image: InputImage) => void
  setConfirmDialog: (dialog: ConfirmDialog) => void
  setIsDragging: (isDragging: boolean) => void
  setMaskEditorImageId: (imageId: string | null) => void
  setSettings: (settings: Partial<AppSettings>) => void
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
  referenceImageEditAction: AppSettings['referenceImageEditAction']
}

export function useInputImageFiles({
  addInputImage,
  inputImages,
  maxImages,
  replaceFileInputRef,
  replaceInputImage,
  setConfirmDialog,
  setIsDragging,
  setMaskEditorImageId,
  setSettings,
  showToast,
  referenceImageEditAction,
}: UseInputImageFilesArgs) {
  const replaceImageTargetRef = useRef<{ index: number; id: string } | null>(null)

  const handleFiles = async (files: FileList | File[]) => {
    try {
      const currentCount = useStore.getState().inputImages.length
      if (currentCount >= maxImages) {
        useStore.getState().showToast(
          `参考图数量已达上限（${maxImages} 张），无法继续添加`,
          'error',
        )
        return
      }

      const remaining = maxImages - currentCount
      const accepted = Array.from(files).filter((f) => f.type.startsWith('image/'))
      const toAdd = accepted.slice(0, remaining)
      const discarded = accepted.length - toAdd.length

      for (const file of toAdd) {
        await addImageFromFile(file)
      }

      if (discarded > 0) {
        useStore.getState().showToast(
          `已达上限 ${maxImages} 张，${discarded} 张图片被丢弃`,
          'error',
        )
      }
    } catch (err) {
      useStore.getState().showToast(
        `图片添加失败：${err instanceof Error ? err.message : String(err)}`,
        'error',
      )
    }
  }

  const handleFilesRef = useRef(handleFiles)
  handleFilesRef.current = handleFiles
  useGlobalInputImageDropPaste({ handleFilesRef, addInputImage, setIsDragging, showToast })

  const openReplaceReferenceFilePicker = useCallback((idx: number, imageId: string) => {
    replaceImageTargetRef.current = { index: idx, id: imageId }
    replaceFileInputRef.current?.click()
  }, [replaceFileInputRef])

  const commitReferenceEditChoice = useCallback((choice: 'replace-reference' | 'add-mask', remember?: boolean) => {
    if (remember) setSettings({ referenceImageEditAction: choice })
  }, [setSettings])

  const handleEditReferenceImage = useCallback((img: InputImage, idx: number, isMaskTarget: boolean) => {
    if (isMaskTarget) {
      setMaskEditorImageId(img.id)
      return
    }

    if (referenceImageEditAction === 'replace-reference') {
      openReplaceReferenceFilePicker(idx, img.id)
      return
    }

    if (referenceImageEditAction === 'add-mask') {
      setMaskEditorImageId(img.id)
      return
    }

    setConfirmDialog({
      title: '编辑参考图',
      message: '请选择这次要执行的操作。若不勾选下方的选项，则每次都询问；勾选后可在 **设置-习惯配置** 修改选择。',
      checkbox: { label: '以后默认执行此选择' },
      buttons: [
        {
          label: '替换参考图',
          tone: 'secondary',
          action: (remember) => {
            commitReferenceEditChoice('replace-reference', remember)
            openReplaceReferenceFilePicker(idx, img.id)
          },
        },
        {
          label: '添加遮罩',
          tone: 'primary',
          action: (remember) => {
            commitReferenceEditChoice('add-mask', remember)
            setMaskEditorImageId(img.id)
          },
        },
      ],
    })
  }, [commitReferenceEditChoice, openReplaceReferenceFilePicker, referenceImageEditAction, setConfirmDialog, setMaskEditorImageId])

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    await handleFilesRef.current(e.target.files || [])
    e.target.value = ''
  }

  const handleReplaceFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    const target = replaceImageTargetRef.current
    replaceImageTargetRef.current = null
    if (!file || !target) return

    try {
      const image = await createInputImageFromFile(file)
      if (!image) {
        showToast('请选择有效图片', 'error')
        return
      }

      const currentImages = useStore.getState().inputImages
      const currentIdx = currentImages.findIndex((item) => item.id === target.id)
      const targetIdx = currentIdx >= 0 ? currentIdx : target.index
      const previous = currentImages[targetIdx]
      if (!previous) {
        void deleteImageIfUnreferenced(image.id)
        showToast('原参考图已不存在', 'error')
        return
      }
      if (previous.id === image.id) {
        showToast('参考图未变化', 'info')
        return
      }
      if (currentImages.some((item, itemIdx) => itemIdx !== targetIdx && item.id === image.id)) {
        showToast('这张图片已在参考图中', 'info')
        return
      }

      replaceInputImage(targetIdx, image)
      showToast('参考图已替换', 'success')
    } catch (err) {
      showToast(`参考图替换失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }

  return {
    handleEditReferenceImage,
    handleFileUpload,
    handleReplaceFileUpload,
  }
}
