export function isEventStreamResponse(response: Response): boolean {
  return response.headers.get('Content-Type')?.toLowerCase().includes('text/event-stream') ?? false
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function getStringValue(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export function getNumberValue(source: Record<string, unknown>, key: string): number | undefined {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getStreamEventErrorMessage(event: Record<string, unknown>, failedFallbackMessage: string): string | null {
  const error = event.error
  if (isRecordValue(error)) {
    const message = getStringValue(error, 'message')
    if (message) return message
  }
  if (typeof error === 'string' && error.trim()) return error

  const type = getStringValue(event, 'type')
  if (type?.endsWith('.failed')) return getStringValue(event, 'message') ?? failedFallbackMessage
  return null
}

function parseServerSentEventBlock(block: string): string | null {
  const dataLines: string[] = []
  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue
    if (!line.startsWith('data:')) continue
    dataLines.push(line.slice(5).replace(/^ /, ''))
  }

  const data = dataLines.join('\n').trim()
  if (!data || data === '[DONE]') return null
  return data
}

function getAbortedSignal(signals: Array<AbortSignal | undefined>) {
  return signals.find((signal) => signal?.aborted)
}

export function throwIfAborted(...signals: Array<AbortSignal | undefined>) {
  const signal = getAbortedSignal(signals)
  if (!signal) return
  throw signal.reason instanceof Error ? signal.reason : new DOMException('请求已停止', 'AbortError')
}

interface ReadJsonServerSentEventsMessages {
  invalidJsonMessage?: string
  failedFallbackMessage?: string
}

export async function readJsonServerSentEvents(
  response: Response,
  onEvent: (event: Record<string, unknown>) => void | Promise<void>,
  signals: Array<AbortSignal | undefined> = [],
  messages: ReadJsonServerSentEventsMessages = {},
): Promise<void> {
  if (!response.body) throw new Error('接口未返回可读取的流式响应')

  const invalidJsonMessage = messages.invalidJsonMessage ?? '流式响应包含无法解析的 JSON 事件'
  const failedFallbackMessage = messages.failedFallbackMessage ?? '流式请求失败'
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const cancelReader = () => {
    void reader.cancel().catch(() => undefined)
  }
  throwIfAborted(...signals)
  for (const signal of signals) signal?.addEventListener('abort', cancelReader, { once: true })

  const processBlock = async (block: string) => {
    const data = parseServerSentEventBlock(block)
    if (!data) return

    let event: unknown
    try {
      event = JSON.parse(data)
    } catch {
      throw new Error(invalidJsonMessage)
    }
    if (!isRecordValue(event)) return

    const errorMessage = getStreamEventErrorMessage(event, failedFallbackMessage)
    if (errorMessage) throw new Error(errorMessage)

    throwIfAborted(...signals)
    await onEvent(event)
    await Promise.resolve()
    throwIfAborted(...signals)
  }

  try {
    while (true) {
      throwIfAborted(...signals)
      const { value, done } = await reader.read()
      throwIfAborted(...signals)
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let separatorIndex = buffer.search(/\r?\n\r?\n/)
      while (separatorIndex >= 0) {
        const block = buffer.slice(0, separatorIndex)
        const separator = buffer.match(/\r?\n\r?\n/)?.[0] ?? '\n\n'
        buffer = buffer.slice(separatorIndex + separator.length)
        await processBlock(block)
        separatorIndex = buffer.search(/\r?\n\r?\n/)
      }
    }

    buffer += decoder.decode()
    throwIfAborted(...signals)
    if (buffer.trim()) await processBlock(buffer)
  } finally {
    for (const signal of signals) signal?.removeEventListener('abort', cancelReader)
  }
}
