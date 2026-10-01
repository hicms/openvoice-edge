import { readJson, writeJson, STORAGE_KEYS } from '@/lib/storage'

export interface TtsPrefs {
  model: string | null
  voices: Record<string, string>
  speed: number
  pitch: number
  volume: number
  style: string
  instructions: string
}

export const DEFAULT_PREFS: TtsPrefs = { model: null, voices: {}, speed: 1, pitch: 0, volume: 0, style: '', instructions: '' }

export function loadPrefs(): TtsPrefs {
  const saved = readJson<Partial<TtsPrefs>>(STORAGE_KEYS.ttsPrefs, {})
  return {
    model: typeof saved.model === 'string' ? saved.model : null,
    voices: saved.voices && typeof saved.voices === 'object' ? saved.voices : {},
    speed: typeof saved.speed === 'number' ? saved.speed : DEFAULT_PREFS.speed,
    pitch: typeof saved.pitch === 'number' ? saved.pitch : DEFAULT_PREFS.pitch,
    volume: typeof saved.volume === 'number' ? saved.volume : DEFAULT_PREFS.volume,
    style: typeof saved.style === 'string' ? saved.style : '',
    instructions: typeof saved.instructions === 'string' ? saved.instructions : '',
  }
}

export function savePrefs(prefs: TtsPrefs): void {
  writeJson(STORAGE_KEYS.ttsPrefs, prefs)
}
