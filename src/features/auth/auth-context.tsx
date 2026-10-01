import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Role } from '../../../shared/schemas.ts'
import { ApiError, apiJson, configureApi } from '@/lib/api'
import { readString, writeString, STORAGE_KEYS } from '@/lib/storage'
import { AuthContext, type AuthStatus } from './use-auth'

async function fetchRole(token: string): Promise<Role> {
  return (await apiJson<{ role: Role }>('/api/session', { token })).role
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialToken] = useState(() => readString(STORAGE_KEYS.token))
  const tokenRef = useRef<string | null>(initialToken)
  const [status, setStatus] = useState<AuthStatus>(initialToken ? 'checking' : 'locked')
  const [role, setRole] = useState<Role | null>(null)
  const [attempt, setAttempt] = useState(0)

  const signOut = useCallback(() => {
    tokenRef.current = null
    writeString(STORAGE_KEYS.token, null)
    setRole(null)
    setStatus('locked')
  }, [])

  useEffect(() => {
    configureApi({ getToken: () => tokenRef.current, onUnauthorized: signOut })
  }, [signOut])

  // Validates the stored token on load and on every retry.
  useEffect(() => {
    const token = tokenRef.current
    if (!token) return
    let active = true
    fetchRole(token).then(
      (nextRole) => {
        if (!active) return
        setRole(nextRole)
        setStatus('ready')
      },
      (err: unknown) => {
        if (!active) return
        if (err instanceof ApiError && err.code === 'network') setStatus('unreachable')
        else signOut()
      },
    )
    return () => {
      active = false
    }
  }, [attempt, signOut])

  const signIn = useCallback(async (token: string) => {
    const nextRole = await fetchRole(token)
    tokenRef.current = token
    writeString(STORAGE_KEYS.token, token)
    setRole(nextRole)
    setStatus('ready')
  }, [])

  const recheck = useCallback(() => {
    setStatus('checking')
    setAttempt((n) => n + 1)
  }, [])

  const value = useMemo(() => ({ status, role, signIn, signOut, recheck }), [status, role, signIn, signOut, recheck])
  return <AuthContext value={value}>{children}</AuthContext>
}
