import { describe, expect, it } from 'vitest'
import { getSelectedImageMentionLabel } from './lib/promptImageMentions'
import { setInputImagesInDraftState } from './store/agent/agentInputDrafts'

const imageA = { id: 'image-a', dataUrl: 'data:image/png;base64,a' }
const imageB = { id: 'image-b', dataUrl: 'data:image/png;base64,b' }

describe('input draft image replacement', () => {
  it('preserves selected image mentions when replacing an image with an equivalent image id', () => {
    const replacement = { id: 'image-a-replacement', dataUrl: imageA.dataUrl }
    const prompt = `参考 ${getSelectedImageMentionLabel(0)} 生成`

    const patch = setInputImagesInDraftState({
      appMode: 'gallery',
      activeAgentConversationId: null,
      agentInputDrafts: {},
      galleryInputDraft: null,
      prompt,
      inputImages: [imageA, imageB],
      maskDraft: null,
      maskEditorImageId: null,
    }, [replacement, imageB], {
      equivalentImageIds: { [imageA.id]: replacement.id },
    })

    expect(patch.inputImages.map((img) => img.id)).toEqual([replacement.id, imageB.id])
    expect(patch.prompt).toBe(prompt)
  })
})
