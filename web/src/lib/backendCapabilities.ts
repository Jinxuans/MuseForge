import { backendRequest } from './backendClient'

export interface BackendCapabilities {
  asyncTasks: boolean
  assets: boolean
  providerProfiles: boolean
  square: boolean
  auth: boolean
  defaultProviderApiKey: boolean
  upstreamBaseUrl?: string
}

export async function getBackendCapabilities() {
  const capabilities = await backendRequest<Partial<BackendCapabilities>>('/api/v1/health-capabilities')
  return normalizeBackendCapabilities(capabilities)
}

export function normalizeBackendCapabilities(capabilities: Partial<BackendCapabilities> | null | undefined): BackendCapabilities {
  return {
    asyncTasks: Boolean(capabilities?.asyncTasks),
    assets: Boolean(capabilities?.assets),
    providerProfiles: Boolean(capabilities?.providerProfiles),
    square: Boolean(capabilities?.square),
    auth: Boolean(capabilities?.auth),
    defaultProviderApiKey: Boolean(capabilities?.defaultProviderApiKey),
    upstreamBaseUrl: capabilities?.upstreamBaseUrl,
  }
}
