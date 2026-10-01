import { createApp } from '../../worker/app.ts'
import type { Env } from '../../worker/env.ts'

export const ADMIN_TOKEN = 'test-admin-token-0123456789-abcdef'

export class FakeKV {
  readonly data = new Map<string, { value: string; metadata?: unknown }>()

  async get(key: string, type?: string): Promise<unknown> {
    const entry = this.data.get(key)
    if (!entry) return null
    return type === 'json' ? JSON.parse(entry.value) : entry.value
  }

  async put(key: string, value: string, options?: { metadata?: unknown }): Promise<void> {
    this.data.set(key, { value, metadata: options?.metadata })
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key)
  }

  async list(options?: { prefix?: string }) {
    const keys = [...this.data.entries()]
      .filter(([name]) => name.startsWith(options?.prefix ?? ''))
      .map(([name, entry]) => ({ name, metadata: entry.metadata }))
    return { keys, list_complete: true, cacheStatus: null }
  }
}

export class FakeLimiter {
  readonly calls: string[] = []
  #remaining: number

  constructor(allowed = Infinity) {
    this.#remaining = allowed
  }

  async limit({ key }: { key: string }) {
    this.calls.push(key)
    if (this.#remaining <= 0) return { success: false }
    this.#remaining -= 1
    return { success: true }
  }
}

export interface TestEnv extends Env {
  kv: FakeKV
  authLimiter: FakeLimiter
  userLimiter: FakeLimiter
}

export function makeEnv(overrides: Partial<Env> = {}): TestEnv {
  const kv = new FakeKV()
  const authLimiter = new FakeLimiter()
  const userLimiter = new FakeLimiter()
  return {
    ADMIN_TOKEN,
    CONFIG: kv as unknown as KVNamespace,
    AUTH_LIMITER: authLimiter as unknown as RateLimit,
    USER_LIMITER: userLimiter as unknown as RateLimit,
    kv,
    authLimiter,
    userLimiter,
    ...overrides,
  }
}

export function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

/** Response whose `json()` is loosely typed so assertions can index into bodies directly. */
export type TestResponse = Omit<Response, 'json'> & { json(): Promise<any> }

export async function call(env: Env, path: string, init: RequestInit = {}): Promise<TestResponse> {
  return (await createApp().request(path, init, env)) as TestResponse
}

export function jsonInit(method: string, body: unknown, token = ADMIN_TOKEN): RequestInit {
  return { method, headers: { ...bearer(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

/** Creates an access key through the admin API and returns its plaintext. */
export async function createUserKey(env: Env, label = 'test'): Promise<string> {
  const res = await call(env, '/api/admin/keys', jsonInit('POST', { label }))
  return ((await res.json()) as { key: string }).key
}
