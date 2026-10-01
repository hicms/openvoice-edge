import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { readString, writeString, STORAGE_KEYS } from '@/lib/storage'
import { ThemeContext, type ThemePreference } from './use-theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function readPreference(): ThemePreference {
  const saved = readString(STORAGE_KEYS.theme)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = matchMedia(DARK_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, () => matchMedia(DARK_QUERY).matches)
  const resolved = preference === 'system' ? (systemDark ? 'dark' : 'light') : preference

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    writeString(STORAGE_KEYS.theme, next === 'system' ? null : next)
    setPreferenceState(next)
  }, [])

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference])
  return <ThemeContext value={value}>{children}</ThemeContext>
}
