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

export async function call(
  env: Env,
  path: string,
  init: RequestInit = {},
  upstream?: FakeUpstream,
): Promise<TestResponse> {
  return (await createApp({ fetch: upstream?.fetch }).request(path, init, env)) as TestResponse
}

export interface UpstreamCall {
  url: string
  init: RequestInit
}

type Handler = (call: UpstreamCall) => Response | Promise<Response>

/** Stands in for Microsoft and SiliconFlow; any URL without a handler fails the test loudly. */
export class FakeUpstream {
  readonly calls: UpstreamCall[] = []
  readonly #handlers: { match: RegExp; handler: Handler }[] = []

  on(match: RegExp, handler: Handler): this {
    this.#handlers.unshift({ match, handler })
    return this
  }

  callsTo(match: RegExp): UpstreamCall[] {
    return this.calls.filter((c) => match.test(c.url))
  }

  readonly fetch: typeof fetch = async (input, init = {}) => {
    const url = String(input instanceof Request ? input.url : input)
    const call = { url, init }
    this.calls.push(call)
    const entry = this.#handlers.find((h) => h.match.test(url))
    if (!entry) throw new Error(`Unexpected upstream call: ${url}`)
    return entry.handler(call)
  }
}

export const EDGE_TOKEN_URL = /microsofttranslator\.com\/apps\/endpoint/
export const EDGE_SPEECH_URL = /\.tts\.speech\.microsoft\.com\/cognitiveservices\/v1$/
export const SF_SPEECH_URL = /api\.siliconflow\.cn\/v1\/audio\/speech$/
export const SF_TRANSCRIBE_URL = /api\.siliconflow\.cn\/v1\/audio\/transcriptions$/

function fakeJwt(expiresInSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expiresInSeconds }))
  return `header.${payload}.signature`
}

export function audioResponse(label: string): Response {
  return new Response(new TextEncoder().encode(label), { headers: { 'Content-Type': 'audio/mpeg' } })
}

export function edgeUpstream(): FakeUpstream {
  return new FakeUpstream()
    .on(EDGE_TOKEN_URL, () => Response.json({ r: 'eastus', t: fakeJwt(600) }))
    .on(EDGE_SPEECH_URL, ({ init }) => audioResponse(`edge[${String(init.body).length}]`))
}

export function jsonError(status: number, body: unknown = { code: 1, message: 'upstream said something private' }): Response {
  return Response.json(body, { status })
}

export async function multipart(
  fields: Record<string, string>,
  file?: { name: string; bytes: number | Uint8Array; type?: string },
): Promise<{ body: ArrayBuffer; headers: Record<string, string> }> {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  if (file) {
    const bytes = typeof file.bytes === 'number' ? new Uint8Array(file.bytes).fill(1) : file.bytes
    form.append('file', new File([bytes as BlobPart], file.name, { type: file.type ?? 'audio/mpeg' }))
  }
  const res = new Response(form)
  const body = await res.arrayBuffer()
  return { body, headers: { 'Content-Type': res.headers.get('content-type')!, 'Content-Length': String(body.byteLength) } }
}

export function jsonInit(method: string, body: unknown, token = ADMIN_TOKEN): RequestInit {
  return { method, headers: { ...bearer(token), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

/** Creates an access key through the admin API and returns its plaintext. */
export async function createUserKey(env: Env, label = 'test'): Promise<string> {
  const res = await call(env, '/api/admin/keys', jsonInit('POST', { label }))
  return ((await res.json()) as { key: string }).key
}
