import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendRequest } from './backendClient'

describe('backendRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('adds the anonymous client header and reads v1 envelopes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      data: { asyncTasks: true },
      requestId: 'req-1',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const data = await backendRequest<{ asyncTasks: boolean }>('/api/v1/health-capabilities')

    expect(data).toEqual({ asyncTasks: true })
    const [, init] = fetchMock.mock.calls[0]
    const headers = new Headers((init as RequestInit).headers)
    expect(headers.get('X-Client-ID')).toBeTruthy()
  })

  it('throws structured backend errors with request ids', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'invalid_request',
        message: 'Bad input',
        details: { field: 'prompt' },
      },
      requestId: 'req-2',
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(backendRequest('/api/v1/tasks')).rejects.toMatchObject({
      name: 'BackendApiError',
      message: 'Bad input',
      status: 400,
      code: 'invalid_request',
      requestId: 'req-2',
      details: { field: 'prompt' },
    })
  })

  it('turns non-JSON error responses into backend errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('upstream unavailable', {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    }))

    await expect(backendRequest('/api/v1/tasks')).rejects.toMatchObject({
      name: 'BackendApiError',
      message: 'HTTP 502',
      status: 502,
    })
  })

  it('turns non-JSON success responses into invalid response errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    }))

    await expect(backendRequest('/api/v1/health-capabilities')).rejects.toMatchObject({
      name: 'BackendApiError',
      message: 'Invalid JSON response.',
      status: 200,
    })
  })
})
