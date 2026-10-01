const PREFIX = 'ove.'

export const STORAGE_KEYS = {
  token: 'token',
  language: 'lang',
  theme: 'theme',
  ttsHistory: 'tts.history',
  ttsPrefs: 'tts.prefs',
} as const

type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

// Storage can be unavailable (private mode, blocked cookies); the app then simply forgets between visits.
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch {
    return fallback
  }
}

export function readString(key: StorageKey): string | null {
  return safe(() => localStorage.getItem(PREFIX + key), null)
}

export function writeString(key: StorageKey, value: string | null): void {
  safe(() => (value === null ? localStorage.removeItem(PREFIX + key) : localStorage.setItem(PREFIX + key, value)), undefined)
}

export function readJson<T>(key: StorageKey, fallback: T): T {
  const raw = readString(key)
  if (raw === null) return fallback
  return safe(() => JSON.parse(raw) as T, fallback)
}

export function writeJson(key: StorageKey, value: unknown): void {
  writeString(key, JSON.stringify(value))
}
