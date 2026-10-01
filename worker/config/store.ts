import { AppSettingsSchema, DEFAULT_SETTINGS } from '../../shared/schemas.ts'
import type { AdminConfigUpdate, AppSettings, SiliconflowKeyStatus } from '../../shared/schemas.ts'
import type { Env } from '../env.ts'

const SETTINGS_KEY = 'settings'
const SILICONFLOW_KEY = 'secret:siliconflow'

export interface SiliconflowKey {
  value: string
  source: 'kv' | 'env'
}

export class ConfigStore {
  readonly #env: Env

  constructor(env: Env) {
    this.#env = env
  }

  async getSettings(): Promise<AppSettings> {
    const stored = await this.#env.CONFIG.get<unknown>(SETTINGS_KEY, 'json')
    return mergeSettings(DEFAULT_SETTINGS, stored)
  }

  async updateSettings(update: AdminConfigUpdate): Promise<AppSettings> {
    const { siliconflowApiKey, ...settingsUpdate } = update
    const current = await this.getSettings()
    const next = AppSettingsSchema.parse({
      ...current,
      ...settingsUpdate,
      defaultVoices: { ...current.defaultVoices, ...settingsUpdate.defaultVoices },
    })
    await this.#env.CONFIG.put(SETTINGS_KEY, JSON.stringify(next))
    if (siliconflowApiKey) await this.#env.CONFIG.put(SILICONFLOW_KEY, siliconflowApiKey)
    return next
  }

  async getSiliconflowKey(): Promise<SiliconflowKey | null> {
    const stored = await this.#env.CONFIG.get(SILICONFLOW_KEY)
    if (stored) return { value: stored, source: 'kv' }
    const fromEnv = this.#env.SILICONFLOW_API_KEY?.trim()
    return fromEnv ? { value: fromEnv, source: 'env' } : null
  }

  async clearSiliconflowKey(): Promise<void> {
    await this.#env.CONFIG.delete(SILICONFLOW_KEY)
  }

  async getSiliconflowStatus(): Promise<SiliconflowKeyStatus> {
    const key = await this.getSiliconflowKey()
    if (!key) return { configured: false, source: 'none' }
    return { configured: true, last4: key.value.slice(-4), source: key.source }
  }
}

/** Unknown or invalid stored values fall back to defaults so a bad KV entry cannot take the service down. */
function mergeSettings(defaults: AppSettings, stored: unknown): AppSettings {
  if (!stored || typeof stored !== 'object') return defaults
  const candidate = {
    ...defaults,
    ...stored,
    defaultVoices: { ...defaults.defaultVoices, ...(stored as Partial<AppSettings>).defaultVoices },
  }
  const parsed = AppSettingsSchema.safeParse(candidate)
  return parsed.success ? parsed.data : defaults
}
