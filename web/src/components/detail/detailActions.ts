import { copyImageSourceToClipboard, copyTextToClipboard, getClipboardFailureMessage } from '../../lib/clipboard'
import { downloadImageIds } from '../../lib/downloadImages'

type ToastType = 'info' | 'success' | 'error'
type ShowToast = (message: string, type?: ToastType) => void

export async function copyDetailText(input: {
  text: string
  successMessage: string
  failureMessage: string
  showToast: ShowToast
}) {
  if (!input.text) return
  try {
    await copyTextToClipboard(input.text)
    input.showToast(input.successMessage, 'success')
  } catch (err) {
    input.showToast(getClipboardFailureMessage(input.failureMessage, err), 'error')
  }
}

export async function copyDetailImageSource(input: {
  src: string
  successMessage: string
  failureMessage: string
  showToast: ShowToast
}) {
  if (!input.src) return
  try {
    await copyImageSourceToClipboard(input.src)
    input.showToast(input.successMessage, 'success')
  } catch (err) {
    console.error(err)
    input.showToast(getClipboardFailureMessage(input.failureMessage, err), 'error')
  }
}

export async function downloadDetailImages(input: {
  imageIds: string[]
  filenamePrefix: string
  successMessage: (successCount: number) => string
  showToast: ShowToast
}) {
  if (input.imageIds.length === 0) return

  try {
    const result = await downloadImageIds(input.imageIds, input.filenamePrefix)
    if (result.successCount === 0) {
      input.showToast('下载失败', 'error')
    } else if (result.failCount > 0) {
      input.showToast(`部分下载失败：成功 ${result.successCount}，失败 ${result.failCount}`, 'error')
    } else {
      input.showToast(input.successMessage(result.successCount), 'success')
    }
  } catch (err) {
    console.error(err)
    input.showToast('下载失败', 'error')
  }
}
