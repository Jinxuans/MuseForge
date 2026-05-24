import { describe, expect, it } from 'vitest'
import { backendAssetToStoredServerAsset, getAssetPublicUrl, getAssetTaskId } from './backendAssets'
import type { AssetDTO } from './backendTasks'

describe('backend asset mapping', () => {
  it('accepts camelCase v1 asset fields', () => {
    const asset: AssetDTO = {
      id: 'asset-1',
      taskId: 'task-1',
      projectId: 'project-1',
      taskType: 'image_generation',
      prompt: 'prompt',
      storageKey: 'results/task-1/0.png',
      publicUrl: '/files/results/task-1/0.png',
      mime: 'image/png',
      width: 1024,
      height: 1024,
      sizeBytes: 123,
      sha256: 'abc',
      kind: 'output',
      visibility: 'private',
      createdAt: '2026-05-23T00:00:00.000Z',
    }

    expect(getAssetTaskId(asset)).toBe('task-1')
    expect(getAssetPublicUrl(asset)).toBe('/files/results/task-1/0.png')
    expect(backendAssetToStoredServerAsset(asset)).toMatchObject({
      id: 'asset-1',
      taskId: 'task-1',
      projectId: 'project-1',
      taskType: 'image_generation',
      storageKey: 'results/task-1/0.png',
      publicUrl: '/files/results/task-1/0.png',
      sizeBytes: 123,
      visibility: 'private',
    })
  })

  it('keeps legacy snake_case asset fields compatible', () => {
    const asset: AssetDTO = {
      id: 'asset-2',
      task_id: 'task-2',
      project_id: null,
      task_type: 'generation',
      storage_key: 'results/task-2/0.png',
      public_url: '/files/results/task-2/0.png',
      mime: 'image/png',
      size_bytes: 456,
      sha256: 'def',
      created_at: '2026-05-23T00:00:00.000Z',
    }

    expect(getAssetTaskId(asset)).toBe('task-2')
    expect(getAssetPublicUrl(asset)).toBe('/files/results/task-2/0.png')
    expect(backendAssetToStoredServerAsset(asset)).toMatchObject({
      id: 'asset-2',
      taskId: 'task-2',
      taskType: 'generation',
      storageKey: 'results/task-2/0.png',
      publicUrl: '/files/results/task-2/0.png',
      sizeBytes: 456,
    })
  })
})
