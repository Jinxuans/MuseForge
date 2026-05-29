import type { ApiProfile, TaskRecord } from '../../types'
import { BackendApiError } from '../../lib/backendClient'
import { readErrorDebugPayload } from '../../lib/errorDebugPayload'
import { getTimeoutStreamingHint } from '../errorMessages'

type TaskErrorRawPayload = Pick<Partial<TaskRecord>, 'rawImageUrls' | 'rawResponsePayload' | 'lastRequestId'>

function isApiRequestNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) {
    const message = err.message.toLowerCase()
    return /failed to fetch|fetch failed|load failed|networkerror|network request failed/i.test(message)
  }
  return false
}

function getApiModeApiName(apiMode: ApiProfile['apiMode']) {
  return apiMode === 'responses' ? 'Responses API' : 'Image API'
}

export function getApiRequestNetworkErrorHint(
  err: unknown,
  createdAt: number,
  usesApiProxy: boolean,
  profile?: Pick<ApiProfile, 'provider' | 'apiMode' | 'streamImages' | 'streamPartialImages'> | null,
): string | null {
  if (!isApiRequestNetworkError(err)) return null

  const elapsedSeconds = Math.max(0, (Date.now() - createdAt) / 1000)

  if (elapsedSeconds <= 15) {
    if (usesApiProxy) {
      return '提示：请求立即失败，请检查 API 代理服务是否正常运行。'
    }
    const unsupportedApiHint = profile?.provider === 'openai'
      ? `\n· API 不支持 ${getApiModeApiName(profile.apiMode)}`
      : ''
    return `提示：请求立即失败，可能原因：\n· API 服务器不可达或地址有误，请检查 API URL 是否正确、服务是否正常运行${unsupportedApiHint}\n· 接口不支持浏览器跨域请求，可使用 Docker 部署版或本地运行版并配置 API 代理解决`
  }

  if (elapsedSeconds >= 55 && elapsedSeconds <= 75) {
    return `提示：请求等待约 60 秒后被断开，这通常是 Nginx 等反向代理的默认超时，而非接口本身报错。可调大代理的超时时间（如 proxy_read_timeout），或降低图片尺寸/质量后重试。${getTimeoutStreamingHint(profile)}`
  }

  if (elapsedSeconds >= 110 && elapsedSeconds <= 140) {
    return `提示：请求等待约 120 秒后被断开，这通常是 Cloudflare 等 CDN/网关的超时限制，而非接口本身报错。如果使用 Cloudflare，可考虑升级套餐或使用不经过 CDN 的直连地址。${getTimeoutStreamingHint(profile)}`
  }

  return `提示：请求等待较长时间后被断开，通常是反向代理或网关的超时限制，而非接口本身报错。可检查代理超时设置，或降低图片尺寸/质量后重试。${getTimeoutStreamingHint(profile)}`
}

export function getRawErrorPayload(err: unknown): TaskErrorRawPayload {
  if (!(err instanceof Error)) return {}

  const payload = readErrorDebugPayload(err)
  const requestId = err instanceof BackendApiError ? err.requestId : payload.requestId
  return {
    rawImageUrls: payload.rawImageUrls,
    rawResponsePayload: payload.rawResponsePayload,
    lastRequestId: typeof requestId === 'string' && requestId.trim() ? requestId : undefined,
  }
}

export function createTaskErrorDebug(task: TaskRecord, message: string, rawPayload: TaskErrorRawPayload = {}) {
  return {
    createdAt: Date.now(),
    message,
    requestId: rawPayload.lastRequestId,
    apiProvider: task.apiProvider,
    apiProfileName: task.apiProfileName,
    apiMode: task.apiMode,
    apiModel: task.apiModel,
    params: task.params,
    rawImageUrls: rawPayload.rawImageUrls,
    rawResponsePayload: rawPayload.rawResponsePayload,
  }
}
