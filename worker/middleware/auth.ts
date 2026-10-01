import { createMiddleware } from 'hono/factory'
import { AppError } from '../../shared/errors.ts'
import { verifyAccessKey } from '../config/access-keys.ts'
import { MIN_ADMIN_TOKEN_LENGTH, type AppEnv } from '../env.ts'
import { timingSafeEqualText } from '../lib/crypto.ts'

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  return match ? match[1]! : null
}

async function underLimit(limiter: RateLimit | undefined, key: string): Promise<boolean> {
  // A missing binding is a deployment error; failing closed beats silently serving unmetered traffic.
  if (!limiter) throw new AppError('server_not_configured', 'Rate limiter binding is missing.')
  return (await limiter.limit({ key })).success
}

/**
 * Order matters: the per-IP limit runs before any credential is checked so that
 * guessing keys is throttled, and the per-identity limit runs after so that one
 * leaked key cannot drain the upstream balance.
 */
export const authenticate = createMiddleware<AppEnv>(async (c, next) => {
  const adminToken = c.env.ADMIN_TOKEN
  if (!adminToken || adminToken.length < MIN_ADMIN_TOKEN_LENGTH) {
    throw new AppError('server_not_configured', 'ADMIN_TOKEN is not set or is too short.')
  }

  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown'
  if (!(await underLimit(c.env.AUTH_LIMITER, ip))) {
    throw new AppError('rate_limited', 'Too many requests. Try again in a minute.')
  }

  const token = bearerToken(c.req.header('Authorization'))
  if (!token) throw new AppError('unauthorized', 'Missing or invalid access key.')

  let role: 'admin' | 'user'
  let identity: string
  if (await timingSafeEqualText(token, adminToken)) {
    role = 'admin'
    identity = 'admin'
  } else {
    const keyId = await verifyAccessKey(c.env.CONFIG, token)
    if (!keyId) throw new AppError('unauthorized', 'Missing or invalid access key.')
    role = 'user'
    identity = `ak:${keyId}`
  }

  if (!(await underLimit(c.env.USER_LIMITER, identity))) {
    throw new AppError('rate_limited', 'Too many requests. Try again in a minute.')
  }

  c.set('role', role)
  c.set('identity', identity)
  await next()
})

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('role') !== 'admin') throw new AppError('forbidden', 'Administrator access is required.')
  await next()
})
