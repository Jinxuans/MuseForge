import { backendRequest } from './backendClient'

export interface ProviderProfileDTO {
  id: number | string
  name: string
  type: string
  base_url?: string
  baseUrl?: string
  model?: string
  api_mode?: 'images' | 'responses' | string
  apiMode?: 'images' | 'responses' | string
  provider_config?: Record<string, unknown>
  providerConfig?: Record<string, unknown>
  api_key_hint?: string
  apiKeyHint?: string
  created_at?: string
  createdAt?: string
  deleted_at?: string | null
  deletedAt?: string | null
}

export interface CreateProviderProfileInput {
  name: string
  type?: string
  baseUrl: string
  apiKey?: string
  model?: string
  apiMode?: 'images' | 'responses'
  providerConfig?: Record<string, unknown>
}

export interface UpdateProviderProfileInput {
  name?: string
  type?: string
  baseUrl?: string
  apiKey?: string
  model?: string
  apiMode?: 'images' | 'responses'
  providerConfig?: Record<string, unknown>
}

export async function listBackendProviderProfiles() {
  const result = await backendRequest<{ provider_profiles?: ProviderProfileDTO[]; items?: ProviderProfileDTO[] }>('/api/v1/provider-profiles')
  return result.items ?? result.provider_profiles ?? []
}

export async function createBackendProviderProfile(input: CreateProviderProfileInput) {
  const result = await backendRequest<{ provider_profile?: ProviderProfileDTO } | ProviderProfileDTO>('/api/v1/provider-profiles', {
    method: 'POST',
    body: {
      name: input.name,
      type: input.type ?? 'openai',
      base_url: input.baseUrl,
      api_key: input.apiKey ?? '',
      model: input.model ?? '',
      api_mode: input.apiMode ?? 'images',
      provider_config: input.providerConfig ?? {},
    },
  })
  return 'provider_profile' in result && result.provider_profile ? result.provider_profile : result as ProviderProfileDTO
}

export async function updateBackendProviderProfile(id: string | number, input: UpdateProviderProfileInput) {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.type !== undefined) body.type = input.type
  if (input.baseUrl !== undefined) body.base_url = input.baseUrl
  if (input.apiKey !== undefined) body.api_key = input.apiKey
  if (input.model !== undefined) body.model = input.model
  if (input.apiMode !== undefined) body.api_mode = input.apiMode
  if (input.providerConfig !== undefined) body.provider_config = input.providerConfig
  const result = await backendRequest<{ provider_profile?: ProviderProfileDTO } | ProviderProfileDTO>(`/api/v1/provider-profiles/${encodeURIComponent(String(id))}`, {
    method: 'PATCH',
    body,
  })
  return 'provider_profile' in result && result.provider_profile ? result.provider_profile : result as ProviderProfileDTO
}

export async function deleteBackendProviderProfile(id: string | number) {
  return backendRequest<{ deleted: boolean }>(`/api/v1/provider-profiles/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
}
