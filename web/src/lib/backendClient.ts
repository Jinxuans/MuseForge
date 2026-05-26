import { createClientHeaders } from './identity'

export type ApiEnvelope<T> =
  | { ok: true; data: T; requestId?: string }
  | { ok: false; error?: { code?: string; message?: string; details?: unknown }; requestId?: string }

export interface BackendRequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | Record<string, unknown> | null
}

export class BackendApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'BackendApiError'
  }
}

function isBodyInit(value: unknown): value is BodyInit {
  return typeof FormData !== 'undefined' && value instanceof FormData
    || typeof Blob !== 'undefined' && value instanceof Blob
    || typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams
    || typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`
}

async function readEnvelope<T>(response: Response): Promise<ApiEnvelope<T>> {
  let payload: any = null
  try {
    payload = await response.json()
  } catch {
    if (!response.ok) {
      return { ok: false, error: { message: `HTTP ${response.status}` } }
    }
    return { ok: false, error: { message: 'Invalid JSON response.' } }
  }
  if (payload && typeof payload === 'object' && 'ok' in payload) return payload as ApiEnvelope<T>

  if (!response.ok) {
    const message = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : typeof payload?.message === 'string'
      ? payload.message
      : `HTTP ${response.status}`
    return { ok: false, error: { message } }
  }
  return { ok: true, data: payload as T }
}

export async function backendRequest<T>(path: string, options: BackendRequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  for (const [key, value] of Object.entries(createClientHeaders())) {
    headers.set(key, value)
  }

  let body = options.body ?? null
  if (body && !isBodyInit(body) && typeof body === 'object') {
    headers.set('Content-Type', headers.get('Content-Type') ?? 'application/json')
    body = JSON.stringify(body)
  }

  const response = await fetch(normalizePath(path), {
    ...options,
    cache: options.cache ?? 'no-store',
    headers,
    body: body as BodyInit | null,
  })
  const envelope = await readEnvelope<T>(response)
  if (!envelope.ok) {
    throw new BackendApiError(
      envelope.error?.message || `HTTP ${response.status}`,
      response.status,
      envelope.error?.code,
      envelope.requestId,
      envelope.error?.details,
    )
  }
  return envelope.data
}

export function buildQuery(input: Record<string, string | number | boolean | null | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (value == null || value === '') continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}
