import type { AppSettings } from '../types'
import { normalizeSettings } from '../lib/apiProfiles'

const LEGACY_PROFILE_OVERRIDE_KEYS: Array<keyof AppSettings> = [
  'baseUrl',
  'apiKey',
  'model',
  'timeout',
  'apiMode',
  'codexCli',
  'apiProxy',
  'streamImages',
  'streamPartialImages',
]

function hasLegacyProfileOverrides(settings: Partial<AppSettings>) {
  return LEGACY_PROFILE_OVERRIDE_KEYS.some((key) => settings[key] !== undefined)
}

export function createSettingsPatch(
  previousSettings: AppSettings,
  incomingSettings: Partial<AppSettings>,
  reusedTaskApiProfileId: string | null,
) {
  const previous = normalizeSettings(previousSettings)
  const incoming = incomingSettings as Partial<AppSettings>
  const hasLegacyOverrides = hasLegacyProfileOverrides(incoming)
  const merged = normalizeSettings({ ...previous, ...incoming })
  if (hasLegacyOverrides && incoming.profiles === undefined) {
    merged.profiles = merged.profiles.map((profile) =>
      profile.id === merged.activeProfileId
        ? {
            ...profile,
            baseUrl: incoming.baseUrl ?? profile.baseUrl,
            apiKey: incoming.apiKey ?? profile.apiKey,
            model: incoming.model ?? profile.model,
            timeout: incoming.timeout ?? profile.timeout,
            apiMode: incoming.apiMode === 'images' || incoming.apiMode === 'responses' ? incoming.apiMode : profile.apiMode,
            codexCli: incoming.codexCli ?? profile.codexCli,
            apiProxy: incoming.apiProxy ?? profile.apiProxy,
            streamImages: incoming.streamImages ?? profile.streamImages,
            streamPartialImages: incoming.streamPartialImages ?? profile.streamPartialImages,
          }
        : profile,
    )
  }
  const settings = normalizeSettings(merged)
  const shouldClearReusedProfile = reusedTaskApiProfileId && settings.activeProfileId === reusedTaskApiProfileId
  return {
    settings,
    ...(shouldClearReusedProfile
      ? { reusedTaskApiProfileId: null, reusedTaskApiProfileName: null, reusedTaskApiProfileMissing: false }
      : {}),
  }
}
