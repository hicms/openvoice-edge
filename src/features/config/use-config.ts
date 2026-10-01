import { createContext, useContext } from 'react'
import type { PublicConfig } from '../../../shared/schemas.ts'

export interface ConfigValue {
  config: PublicConfig | null
  error: unknown
  reload: () => void
}

export const ConfigContext = createContext<ConfigValue | null>(null)

export function useConfig(): ConfigValue {
  const value = useContext(ConfigContext)
  if (!value) throw new Error('useConfig must be used inside ConfigProvider')
  return value
}
