import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { createDefaultOpenAIProfile } from './apiProfiles'
import { backendTaskToTaskRecord, getTaskOutputAssets, mapServerTaskStatus, serverTaskParams, type CreativeTaskDTO } from './backendTasks'

describe('backend task mapping', () => {
  it('maps server statuses to local task statuses', () => {
    expect(mapServerTaskStatus('queued')).toBe('running')
    expect(mapServerTaskStatus('running')).toBe('running')
    expect(mapServerTaskStatus('succeeded')).toBe('done')
    expect(mapServerTaskStatus('failed')).toBe('error')
    expect(mapServerTaskStatus('canceled')).toBe('error')
  })

  it('prefers outputAssets over raw assets', () => {
    const task: CreativeTaskDTO = {
      id: 'task_1',
      type: 'image_generation',
      status: 'succeeded',
      prompt: 'prompt',
      model: 'gpt-image-2',
      params: { size: '1024x1024' },
      outputAssets: [
        { id: 'asset_1', mime: 'image/png', publicUrl: '/files/results/task_1/0.png', sizeBytes: 1, sha256: 'abc' },
      ],
      assets: [
        { id: 'asset_legacy', mime: 'image/png', publicUrl: '/files/results/task_1/legacy.png', sizeBytes: 1, sha256: 'def' },
      ],
      createdAt: '2026-05-23T00:00:00.000Z',
      completedAt: '2026-05-23T00:01:00.000Z',
    }

    expect(getTaskOutputAssets(task)).toHaveLength(1)
    const mapped = backendTaskToTaskRecord(task, {
      profile: createDefaultOpenAIProfile(),
      outputImageIds: ['img_1'],
    })

    expect(mapped.id).toBe('task_1')
    expect(mapped.status).toBe('done')
    expect(mapped.outputImages).toEqual(['img_1'])
    expect(mapped.apiMode).toBe('images')
    expect(mapped.params.size).toBe('1024x1024')
    expect(mapped.params.quality).toBe(DEFAULT_PARAMS.quality)
    expect(mapped.rawImageUrls).toEqual(['/files/results/task_1/0.png'])
    expect(mapped.finishedAt).toBeGreaterThan(mapped.createdAt)
    expect(mapped.serverTaskId).toBe('task_1')
  })

  it('keeps snake_case task params compatible with the v1 contract', () => {
    expect(serverTaskParams({
      id: 'task_2',
      type: 'generation',
      status: 'queued',
      prompt: 'prompt',
      model: 'gpt-image-2',
      params_json: { size: '1024x1536', quality: 'high' },
    })).toEqual({ size: '1024x1536', quality: 'high' })
  })
})
