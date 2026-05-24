const CLIENT_ID_KEY = 'museforge-client-id'

function createClientId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const random = Math.random().toString(36).slice(2)
  return `anon-${Date.now().toString(36)}-${random}`
}

export function readClientId(): string {
  if (typeof localStorage === 'undefined') return createClientId()

  const existing = localStorage.getItem(CLIENT_ID_KEY)?.trim()
  if (existing) return existing

  const id = createClientId()
  localStorage.setItem(CLIENT_ID_KEY, id)
  return id
}

export function createClientHeaders(): Record<string, string> {
  return {
    'X-Client-ID': readClientId(),
  }
}
