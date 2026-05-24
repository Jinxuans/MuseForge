import { describe, expect, it } from 'vitest'
import { normalizeBackendCapabilities } from './backendCapabilities'

describe('backend capabilities', () => {
  it('defaults missing capabilities to false for stable self-hosting gates', () => {
    expect(normalizeBackendCapabilities({ upstreamBaseUrl: 'https://api.openai.com/v1' })).toEqual({
      asyncTasks: false,
      assets: false,
      providerProfiles: false,
      square: false,
      auth: false,
      defaultProviderApiKey: false,
      upstreamBaseUrl: 'https://api.openai.com/v1',
    })
  })

  it('preserves explicit true feature flags', () => {
    expect(normalizeBackendCapabilities({
      asyncTasks: true,
      assets: true,
      providerProfiles: true,
      square: false,
      auth: false,
      defaultProviderApiKey: true,
    })).toMatchObject({
      asyncTasks: true,
      assets: true,
      providerProfiles: true,
      square: false,
      auth: false,
      defaultProviderApiKey: true,
    })
  })
})
