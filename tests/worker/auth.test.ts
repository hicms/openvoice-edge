import { describe, expect, it } from 'vitest'
import { timingSafeEqualText } from '../../worker/lib/crypto.ts'
import { ADMIN_TOKEN, FakeLimiter, bearer, call, createUserKey, makeEnv } from './helpers.ts'

describe('timingSafeEqualText', () => {
  it('matches equal strings and rejects different ones, including different lengths', async () => {
    expect(await timingSafeEqualText('abc', 'abc')).toBe(true)
    expect(await timingSafeEqualText('abc', 'abd')).toBe(false)
    expect(await timingSafeEqualText('abc', 'abcd')).toBe(false)
    expect(await timingSafeEqualText('', '')).toBe(true)
  })
})

describe('authentication', () => {
  it('keeps /api/health public and minimal', async () => {
    const res = await call(makeEnv(), '/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it.each(['/api/session', '/v1/models', '/api/admin/config', '/v1/anything'])('rejects %s without a key', async (path) => {
    const res = await call(makeEnv(), path)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: { message: 'Missing or invalid access key.', type: 'authentication_error', code: 'unauthorized' },
    })
  })

  it('rejects a wrong bearer token and a malformed header', async () => {
    const env = makeEnv()
    expect((await call(env, '/api/session', { headers: bearer('nope') })).status).toBe(401)
    expect((await call(env, '/api/session', { headers: { Authorization: 'Basic abc' } })).status).toBe(401)
  })

  it('identifies the admin token as admin', async () => {
    const res = await call(makeEnv(), '/api/session', { headers: bearer(ADMIN_TOKEN) })
    expect(await res.json()).toEqual({ role: 'admin' })
  })

  it('identifies a created access key as user and blocks the admin area', async () => {
    const env = makeEnv()
    const key = await createUserKey(env)
    expect(await (await call(env, '/api/session', { headers: bearer(key) })).json()).toEqual({ role: 'user' })
    const res = await call(env, '/api/admin/config', { headers: bearer(key) })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
  })

  it('rejects a key with a valid shape but the wrong secret', async () => {
    const env = makeEnv()
    const key = await createUserKey(env)
    const forged = key.slice(0, -3) + 'AAA'
    expect((await call(env, '/api/session', { headers: bearer(forged) })).status).toBe(401)
  })

  it('stops honouring a revoked key', async () => {
    const env = makeEnv()
    const key = await createUserKey(env)
    const id = key.split('_')[1]
    await call(env, `/api/admin/keys/${id}`, { method: 'DELETE', headers: bearer(ADMIN_TOKEN) })
    expect((await call(env, '/api/session', { headers: bearer(key) })).status).toBe(401)
  })

  it.each([undefined, '', 'short-token'])('refuses everything when ADMIN_TOKEN is %j', async (token) => {
    const env = makeEnv({ ADMIN_TOKEN: token })
    const res = await call(env, '/api/session', { headers: bearer('anything') })
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('server_not_configured')
  })
})

describe('rate limiting', () => {
  it('limits by IP before checking credentials', async () => {
    const env = makeEnv({ AUTH_LIMITER: new FakeLimiter(1) as unknown as RateLimit })
    const headers = { ...bearer('wrong'), 'CF-Connecting-IP': '203.0.113.9' }
    expect((await call(env, '/api/session', { headers })).status).toBe(401)
    const res = await call(env, '/api/session', { headers })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
    expect((await res.json()).error.code).toBe('rate_limited')
  })

  it('limits per identity after authentication', async () => {
    const limiter = new FakeLimiter(1)
    const env = makeEnv({ USER_LIMITER: limiter as unknown as RateLimit })
    const first = await call(env, '/api/session', { headers: bearer(ADMIN_TOKEN) })
    const second = await call(env, '/api/session', { headers: bearer(ADMIN_TOKEN) })
    expect(first.status).toBe(200)
    expect(second.status).toBe(429)
    expect(limiter.calls).toEqual(['admin', 'admin'])
  })

  it('fails closed when a limiter binding is missing', async () => {
    const env = makeEnv({ AUTH_LIMITER: undefined as unknown as RateLimit })
    expect((await call(env, '/api/session', { headers: bearer(ADMIN_TOKEN) })).status).toBe(503)
  })
})

describe('response headers', () => {
  it('sets no-store and nosniff on success and on errors, and never CORS headers', async () => {
    const env = makeEnv()
    for (const res of [
      await call(env, '/api/health'),
      await call(env, '/api/session', { headers: bearer(ADMIN_TOKEN) }),
      await call(env, '/api/session'),
      await call(env, '/api/nope', { headers: bearer(ADMIN_TOKEN) }),
    ]) {
      expect(res.headers.get('Cache-Control')).toBe('no-store')
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
  })

  it('returns the unified error body for unknown authenticated routes', async () => {
    const res = await call(makeEnv(), '/v1/nope', { headers: bearer(ADMIN_TOKEN) })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('not_found')
  })
})
