import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { PublicConfig } from '../../../shared/schemas.ts'
import { apiJson } from '@/lib/api'
import { ConfigContext } from './use-config'

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let active = true
    apiJson<PublicConfig>('/api/config').then(
      (next) => {
        if (!active) return
        setConfig(next)
        setError(null)
      },
      (err: unknown) => active && setError(err),
    )
    return () => {
      active = false
    }
  }, [version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const value = useMemo(() => ({ config, error, reload }), [config, error, reload])
  return <ConfigContext value={value}>{children}</ConfigContext>
}
