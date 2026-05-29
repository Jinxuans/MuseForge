import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoredImage, TaskRecord } from '../../../types'
import { DEFAULT_PARAMS } from '../../../types'
import { buildMuseForgePromptShareInput, buildMuseForgeTaskShareInput } from './buildShareManifest'

const dbMock = vi.hoisted(() => {
  const images = new Map<string, StoredImage>()
  return {
    images,
    getImage: vi.fn(async (id: string) => images.get(id)),
  }
})

vi.mock('../../../lib/db', () => ({
  getImage: dbMock.getImage,
}))

function installCanvasMocks() {
  const imageCtor = class {
    naturalWidth = 1024
    naturalHeight = 768
    onload: (() => void) | null = null
    onerror: (() => void) | null = null

    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }

  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({
      drawImage: vi.fn(),
    })),
    toBlob: vi.fn((callback: (blob: Blob | null) => void, type?: string) => {
      callback(new Blob(['thumb'], { type: type || 'image/webp' }))
    }),
  }

  vi.stubGlobal('Image', imageCtor)
  vi.stubGlobal('document', {
    createElement: vi.fn(() => canvas),
  })
}

function task(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    id: 'task-1',
    prompt: '生成一张城市夜景角色图',
    params: DEFAULT_PARAMS,
    inputImageIds: [],
    outputImages: ['output-1'],
    status: 'done',
    error: null,
    createdAt: 1000,
    finishedAt: 2000,
    elapsed: 1000,
    ...overrides,
  }
}

describe('buildMuseForgePromptShareInput', () => {
  it('builds a prompt manifest without assets', () => {
    const input = buildMuseForgePromptShareInput({
      title: '  角色提示词  ',
      content: '  prompt body  ',
      tags: ['角色', '角色', '  夜景  ', 'x'.repeat(40)],
    })

    const manifest = input.manifest as Record<string, any>
    expect(input.assets).toEqual([])
    expect(manifest.kind).toBe('prompt')
    expect(manifest.title).toBe('角色提示词')
    expect(manifest.prompt).toBe('prompt body')
    expect(manifest.tags).toEqual(['角色', '夜景', 'x'.repeat(24)])
    expect(manifest.source).toEqual({ app: 'MuseForge', schemaVersion: 1 })
  })
})

describe('buildMuseForgeTaskShareInput', () => {
  beforeEach(() => {
    installCanvasMocks()
    dbMock.images.clear()
    dbMock.getImage.mockClear()
    dbMock.images.set('output-1', {
      id: 'output-1',
      dataUrl: 'data:image/png;base64,b3V0cHV0',
      source: 'generated',
      width: 1024,
      height: 768,
    })
    dbMock.images.set('origin-1', {
      id: 'origin-1',
      dataUrl: 'data:image/png;base64,b3JpZ2lu',
      source: 'upload',
      width: 640,
      height: 480,
    })
  })

  it('builds a sanitized task manifest with lineage and upload assets', async () => {
    const parent = task({
      id: 'parent-task',
      prompt: '上游任务',
      inputImageIds: ['origin-1'],
      outputImages: ['parent-output'],
      parentTaskId: null,
    })
    dbMock.images.set('parent-output', {
      id: 'parent-output',
      dataUrl: 'data:image/png;base64,cGFyZW50',
      source: 'generated',
      width: 512,
      height: 512,
    })

    const entry = task({
      parentTaskId: 'parent-task',
      parentImageId: 'parent-output',
      inputImageIds: ['parent-output'],
      apiProfileId: 'profile-secret-id',
      apiProfileName: '公开供应商名称',
      apiModel: 'secret-model-snapshot',
      rawImageUrls: ['https://secret.example/image.png'],
      rawResponsePayload: '{"secret":"debug"}',
      errorDebug: {
        createdAt: 3000,
        message: 'debug secret',
        rawResponsePayload: '{"secret":"debug"}',
      },
      ...( {
        baseUrl: 'https://secret.example/v1',
        apiKey: 'sk-secret',
      } as Partial<TaskRecord>),
    })

    const input = await buildMuseForgeTaskShareInput({
      task: entry,
      tasks: [entry, parent],
      title: '城市角色分享',
      tags: ['城市', '角色'],
    })

    const manifest = input.manifest as Record<string, any>
    expect(manifest.kind).toBe('task')
    expect(manifest.source).toEqual({ app: 'MuseForge', schemaVersion: 1 })
    expect(manifest.taskShare.lineage).toHaveLength(2)
    expect(manifest.assets).toHaveLength(3)
    expect(input.assets).toHaveLength(3)

    const serialized = JSON.stringify(manifest)
    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain('secret.example')
    expect(serialized).not.toContain('debug secret')
    expect(serialized).not.toContain('rawResponsePayload')
    expect(serialized).not.toContain('errorDebug')
    expect(serialized).not.toContain('profile-secret-id')
  })

  it('rejects recycle bin and unfinished tasks', async () => {
    await expect(buildMuseForgeTaskShareInput({
      task: task({ deletedAt: Date.now() }),
      tasks: [],
      title: '',
      tags: [],
    })).rejects.toThrow('回收站')

    await expect(buildMuseForgeTaskShareInput({
      task: task({ status: 'running' }),
      tasks: [],
      title: '',
      tags: [],
    })).rejects.toThrow('成功完成')
  })
})
