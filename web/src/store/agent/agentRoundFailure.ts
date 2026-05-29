import type { ApiProfile, AppSettings } from '../../types'
import { IMAGE_FETCH_CORS_HINT } from '../../lib/imageApiShared'
import { getApiRequestNetworkErrorHint } from '../tasks/taskErrorDebug'

export function getAgentRoundFailureMessage(input: {
  err: unknown
  startedAt: number
  activeProfile: ApiProfile
  requestSettings: AppSettings
}) {
  let message = input.err instanceof Error ? input.err.message : String(input.err)
  const usesApiProxy = input.activeProfile.apiProxy ?? input.requestSettings.apiProxy
  const networkErrorHint = getApiRequestNetworkErrorHint(input.err, input.startedAt, usesApiProxy, input.activeProfile)
  if (networkErrorHint && !message.includes(IMAGE_FETCH_CORS_HINT)) {
    message += `\n${networkErrorHint}`
  }
  return message
}
