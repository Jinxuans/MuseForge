import {
  createDefaultOpenAIProfile,
  DEFAULT_FAL_BASE_URL,
  DEFAULT_FAL_MODEL,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_OPENAI_PROFILE_ID,
  DEFAULT_RESPONSES_MODEL,
  DEFAULT_SETTINGS,
  findEquivalentApiProfile,
  normalizeSettings,
  normalizeStreamPartialImages,
} from '../../lib/apiProfiles'
import { normalizeBaseUrl } from '../../lib/api'
import { DEFAULT_STREAM_PARTIAL_IMAGES, type ApiProfile, type AppSettings, type CustomProviderDefinition } from '../../types'

export const ADD_CUSTOM_PROVIDER_VALUE = '__add_custom_provider__'

const COPY_IMPORT_URL_OPTIONS_STORAGE_KEY = 'museforge.copy-import-url-options'

export const DEFAULT_COPY_IMPORT_URL_OPTIONS = {
  includeApiKey: false,
  useNewApiAddress: false,
  useNewApiKey: true,
  useNewApiModel: false,
}

export type CopyImportUrlOptions = typeof DEFAULT_COPY_IMPORT_URL_OPTIONS

export function newId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function readCopyImportUrlOptions(): CopyImportUrlOptions {
  if (typeof window === 'undefined') return DEFAULT_COPY_IMPORT_URL_OPTIONS

  try {
    const saved = window.localStorage.getItem(COPY_IMPORT_URL_OPTIONS_STORAGE_KEY)
    if (!saved) return DEFAULT_COPY_IMPORT_URL_OPTIONS

    const parsed = JSON.parse(saved) as Partial<CopyImportUrlOptions> | null
    if (!parsed || typeof parsed !== 'object') return DEFAULT_COPY_IMPORT_URL_OPTIONS

    return {
      includeApiKey: false,
      useNewApiAddress: Boolean(parsed.useNewApiAddress),
      useNewApiKey: parsed.useNewApiKey === undefined ? true : Boolean(parsed.useNewApiKey),
      useNewApiModel: Boolean(parsed.useNewApiModel),
    }
  } catch {
    return DEFAULT_COPY_IMPORT_URL_OPTIONS
  }
}

export function saveCopyImportUrlOptions(options: CopyImportUrlOptions) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(COPY_IMPORT_URL_OPTIONS_STORAGE_KEY, JSON.stringify({
      useNewApiAddress: options.useNewApiAddress,
      useNewApiKey: options.useNewApiKey,
      useNewApiModel: options.useNewApiModel,
    }))
  } catch {
    // localStorage 不可用时只保留当前会话状态。
  }
}

export function isPristineNewOpenAIProfile(profile: ApiProfile) {
  const defaultProfile = createDefaultOpenAIProfile({ id: profile.id, name: '新配置' })
  return profile.name === '新配置' &&
    profile.provider === 'openai' &&
    profile.baseUrl === DEFAULT_SETTINGS.baseUrl &&
    profile.apiKey === '' &&
    profile.model === DEFAULT_IMAGES_MODEL &&
    profile.timeout === DEFAULT_SETTINGS.timeout &&
    profile.apiMode === 'images' &&
    profile.codexCli === false &&
    profile.apiProxy === defaultProfile.apiProxy &&
    profile.streamImages === defaultProfile.streamImages &&
    profile.streamPartialImages === defaultProfile.streamPartialImages
}

export function getDefaultModelForMode(apiMode: AppSettings['apiMode']) {
  return apiMode === 'responses' ? DEFAULT_RESPONSES_MODEL : DEFAULT_IMAGES_MODEL
}

export function normalizeSettingsDraftForCommit(nextDraft: AppSettings, options: {
  apiProxyAvailable: boolean
  apiProxyLocked: boolean
}) {
  const normalizedProfiles = nextDraft.profiles.map((profile) => {
    const normalizedBaseUrl = profile.provider === 'fal'
      ? profile.baseUrl.trim().replace(/\/+$/, '') || DEFAULT_FAL_BASE_URL
      : normalizeBaseUrl(profile.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl)
    const defaultModel = profile.provider === 'fal' ? DEFAULT_FAL_MODEL : getDefaultModelForMode(profile.apiMode)
    return {
      ...profile,
      name: profile.name.trim() || (profile.id === DEFAULT_OPENAI_PROFILE_ID ? 'TokFlux' : '新配置'),
      baseUrl: normalizedBaseUrl,
      model: profile.model.trim() || defaultModel,
      timeout: Number(profile.timeout) || DEFAULT_SETTINGS.timeout,
      apiProxy: profile.provider === 'openai' && options.apiProxyAvailable ? (options.apiProxyLocked || profile.apiProxy) : false,
      directApiAccess: profile.provider === 'openai' ? profile.directApiAccess : false,
      codexCli: profile.provider === 'openai' ? profile.codexCli : false,
      streamImages: profile.provider === 'openai' ? profile.streamImages : false,
      streamPartialImages: profile.provider === 'openai' ? normalizeStreamPartialImages(profile.streamPartialImages) : DEFAULT_STREAM_PARTIAL_IMAGES,
    }
  })
  const fallbackProfile = createDefaultOpenAIProfile({ id: newId('openai') })
  return normalizeSettings({
    ...nextDraft,
    profiles: normalizedProfiles.length ? normalizedProfiles : [fallbackProfile],
    activeProfileId: normalizedProfiles.some((profile) => profile.id === nextDraft.activeProfileId)
      ? nextDraft.activeProfileId
      : (normalizedProfiles[0]?.id ?? fallbackProfile.id),
  })
}

export function getServerProviderType(profile: ApiProfile) {
  if (profile.provider === 'openai' || profile.provider === 'fal') return profile.provider
  return 'custom-http-image'
}

export function createBackendProviderProfileInput(profile: ApiProfile, customProvider: CustomProviderDefinition | undefined) {
  return {
    name: profile.name,
    type: getServerProviderType(profile),
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey.trim() ? profile.apiKey.trim() : undefined,
    model: profile.model,
    apiMode: profile.apiMode ?? DEFAULT_SETTINGS.apiMode,
    providerConfig: customProvider ? { customProvider } : {},
  }
}

export function applySavedBackendProviderProfile(draft: AppSettings, activeProfileId: string, serverProfileId: string) {
  return normalizeSettings({
    ...draft,
    profiles: draft.profiles.map((profile) => profile.id === activeProfileId ? {
      ...profile,
      serverProfileId,
      apiKey: '',
    } : profile),
  })
}

export function applyDeletedBackendProviderProfile(draft: AppSettings, activeProfileId: string) {
  return normalizeSettings({
    ...draft,
    profiles: draft.profiles.map((profile) => profile.id === activeProfileId ? {
      ...profile,
      serverProfileId: undefined,
    } : profile),
  })
}

export function createProfileImportUrl(
  profile: ApiProfile,
  options: CopyImportUrlOptions,
  customProviders: CustomProviderDefinition[],
  currentHref: string,
) {
  const url = new URL(currentHref)
  url.search = ''
  url.hash = ''

  if (profile.provider === 'openai') {
    const baseUrl = profile.baseUrl.trim() || DEFAULT_SETTINGS.baseUrl
    url.searchParams.set('apiUrl', options.useNewApiAddress && !options.includeApiKey ? '{address}' : normalizeBaseUrl(baseUrl))
    if (options.includeApiKey && profile.apiKey.trim()) {
      url.searchParams.set('apiKey', profile.apiKey.trim())
    } else if (!options.includeApiKey && options.useNewApiKey) {
      url.searchParams.set('apiKey', '{key}')
    }
    url.searchParams.set('apiMode', profile.apiMode)
    const model = profile.model.trim() || getDefaultModelForMode(profile.apiMode)
    url.searchParams.set('model', !options.includeApiKey && options.useNewApiModel ? '{model}' : model)
    if (profile.codexCli) url.searchParams.set('codexCli', 'true')
    if (profile.streamImages !== DEFAULT_SETTINGS.streamImages) url.searchParams.set('streamImages', String(Boolean(profile.streamImages)))
    if (profile.streamPartialImages !== DEFAULT_STREAM_PARTIAL_IMAGES) url.searchParams.set('streamPartialImages', String(normalizeStreamPartialImages(profile.streamPartialImages)))

    let result = url.toString()
    if (!options.includeApiKey) {
      if (options.useNewApiAddress) result = result.replace('%7Baddress%7D', '{address}')
      if (options.useNewApiKey) result = result.replace('%7Bkey%7D', '{key}')
      if (options.useNewApiModel) result = result.replace('%7Bmodel%7D', '{model}')
    }
    return result
  }

  const provider = customProviders.find((item) => item.id === profile.provider)
  const importProfile: ApiProfile = {
    ...profile,
    apiKey: options.includeApiKey ? profile.apiKey : '',
  }
  if (!options.includeApiKey) {
    if (options.useNewApiAddress) importProfile.baseUrl = '{address}'
    if (options.useNewApiKey) importProfile.apiKey = '{key}'
    if (options.useNewApiModel) importProfile.model = '{model}'
  }
  url.searchParams.set('settings', JSON.stringify({
    customProviders: provider ? [provider] : [],
    profiles: [importProfile],
  }))

  let result = url.toString()
  if (!options.includeApiKey) {
    if (options.useNewApiAddress) result = result.replace(/%7Baddress%7D/g, '{address}')
    if (options.useNewApiKey) result = result.replace(/%7Bkey%7D/g, '{key}')
    if (options.useNewApiModel) result = result.replace(/%7Bmodel%7D/g, '{model}')
  }
  return result
}

export function getImportedProfileFromMergedSettings(
  nextSettings: AppSettings,
  previousProfileIds: Set<string>,
  importedSettings: { customProviders: CustomProviderDefinition[], profiles: ApiProfile[] },
) {
  const existingProfile = importedSettings.profiles
    .map((profile) => findEquivalentApiProfile(nextSettings, profile, importedSettings.customProviders))
    .find((profile): profile is ApiProfile => profile != null && previousProfileIds.has(profile.id))
  if (existingProfile) return existingProfile

  return nextSettings.profiles.find((profile) => !previousProfileIds.has(profile.id)) ?? nextSettings.profiles[0]
}
