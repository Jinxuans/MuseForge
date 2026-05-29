export type ErrorDebugPayload = {
  rawImageUrls?: string[]
  rawResponsePayload?: string
  requestId?: string
}

type ErrorDebugPayloadCarrier = Error & {
  rawImageUrls?: unknown
  rawResponsePayload?: unknown
  requestId?: unknown
}

function normalizeRawImageUrls(rawImageUrls: unknown) {
  return Array.isArray(rawImageUrls)
    ? rawImageUrls.filter((url): url is string => typeof url === 'string' && url.length > 0)
    : undefined
}

export function attachErrorDebugPayload(err: Error, payload: ErrorDebugPayload) {
  Object.assign(err, {
    ...(payload.rawImageUrls?.length ? { rawImageUrls: payload.rawImageUrls } : {}),
    ...(typeof payload.rawResponsePayload === 'string' ? { rawResponsePayload: payload.rawResponsePayload } : {}),
    ...(typeof payload.requestId === 'string' && payload.requestId.trim() ? { requestId: payload.requestId } : {}),
  })
}

export function readErrorDebugPayload(err: unknown): ErrorDebugPayload {
  if (!(err instanceof Error)) return {}

  const carrier = err as ErrorDebugPayloadCarrier
  const rawImageUrls = normalizeRawImageUrls(carrier.rawImageUrls)
  return {
    rawImageUrls: rawImageUrls?.length ? rawImageUrls : undefined,
    rawResponsePayload: typeof carrier.rawResponsePayload === 'string' ? carrier.rawResponsePayload : undefined,
    requestId: typeof carrier.requestId === 'string' && carrier.requestId.trim() ? carrier.requestId : undefined,
  }
}
