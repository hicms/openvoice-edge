import { createContext, useContext } from 'react'
import type { Role } from '../../../shared/schemas.ts'

export type AuthStatus = 'checking' | 'locked' | 'unreachable' | 'ready'

export interface AuthValue {
  status: AuthStatus
  role: Role | null
  signIn: (token: string) => Promise<void>
  signOut: () => void
  recheck: () => void
}

export const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
