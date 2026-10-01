import type { Role } from '../shared/schemas.ts'

export interface Env {
  /** Admin credential. Shorter than MIN_ADMIN_TOKEN_LENGTH counts as not configured. */
  ADMIN_TOKEN?: string
  /** Bootstrap value for the SiliconFlow key; a key saved from the admin page takes precedence. */
  SILICONFLOW_API_KEY?: string
  CONFIG: KVNamespace
  AUTH_LIMITER: RateLimit
  USER_LIMITER: RateLimit
}

export type AppEnv = {
  Bindings: Env
  Variables: { role: Role; identity: string }
}

export const MIN_ADMIN_TOKEN_LENGTH = 24
