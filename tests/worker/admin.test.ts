import { describe, expect, it } from 'vitest'
import { ADMIN_TOKEN, bearer, call, jsonInit, makeEnv } from './helpers.ts'

const SECRET = 'sk-test-secret-value-ABCDWXYZ'
const get = (env: ReturnType<typeof makeEnv>, path: string) => call(env, path, { headers: bearer(ADMIN_TOKEN) })

describe('admin config', () => {
  it('returns defaults and no key when nothing is stored', async () => {
    const body = await (await get(makeEnv(), '/api/admin/config')).json()
    expect(body.siliconflow).toEqual({ configured: false, source: 'none' })
    expect(body.settings).toMatchObject({ defaultTtsModel: 'edge-tts', maxTtsChars: 5000, maxAudioMb: 25 })
  })

  it('uses the env bootstrap key until a stored key replaces it', async () => {
    const env = makeEnv({ SILICONFLOW_API_KEY: 'sk-from-env-1111' })
    expect((await (await get(env, '/api/admin/config')).json()).siliconflow).toEqual({
      configured: true,
      last4: '1111',
      source: 'env',
    })
    await call(env, '/api/admin/config', jsonInit('PUT', { siliconflowApiKey: SECRET }))
    expect((await (await get(env, '/api/admin/config')).json()).siliconflow).toEqual({
      configured: true,
      last4: 'WXYZ',
      source: 'kv',
    })
  })

  it('stores updates and never echoes the key', async () => {
    const env = makeEnv()
    const res = await call(
      env,
      '/api/admin/config',
      jsonInit('PUT', { siliconflowApiKey: SECRET, maxTtsChars: 2000, defaultVoices: { 'edge-tts': 'en-US-AriaNeural' } }),
    )
    const text = await res.text()
    expect(res.status).toBe(200)
    expect(text).not.toContain(SECRET)
    const view = JSON.parse(text)
    expect(view.settings.maxTtsChars).toBe(2000)
    expect(view.settings.defaultVoices).toMatchObject({ 'edge-tts': 'en-US-AriaNeural', 'FunAudioLLM/CosyVoice2-0.5B': 'alex' })
    expect(await (await get(env, '/api/admin/config')).text()).not.toContain(SECRET)
  })

  it('keeps the stored key when the update sends an empty string or omits it', async () => {
    const env = makeEnv()
    await call(env, '/api/admin/config', jsonInit('PUT', { siliconflowApiKey: SECRET }))
    await call(env, '/api/admin/config', jsonInit('PUT', { siliconflowApiKey: '' }))
    await call(env, '/api/admin/config', jsonInit('PUT', { maxAudioMb: 10 }))
    expect((await (await get(env, '/api/admin/config')).json()).siliconflow.last4).toBe('WXYZ')
  })

  it('clears the stored key through the dedicated endpoint', async () => {
    const env = makeEnv()
    await call(env, '/api/admin/config', jsonInit('PUT', { siliconflowApiKey: SECRET }))
    const res = await call(env, '/api/admin/config/siliconflow-key', { method: 'DELETE', headers: bearer(ADMIN_TOKEN) })
    expect((await res.json()).siliconflow).toEqual({ configured: false, source: 'none' })
  })

  it.each([
    { maxAudioMb: 51 },
    { maxAudioMb: 0 },
    { maxTtsChars: 99 },
    { defaultTtsModel: 'gpt-4o-mini-tts' },
    { defaultSttModel: 'whisper-1' },
    { defaultVoices: { 'not-a-model': 'x' } },
  ])('rejects invalid update %j without storing it', async (update) => {
    const env = makeEnv()
    const res = await call(env, '/api/admin/config', jsonInit('PUT', update))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_request')
    expect(env.kv.data.size).toBe(0)
  })

  it('rejects a body that is not JSON', async () => {
    const res = await call(makeEnv(), '/api/admin/config', {
      method: 'PUT',
      headers: bearer(ADMIN_TOKEN),
      body: 'not json',
    })
    expect(res.status).toBe(400)
  })

  it('falls back to defaults when the stored settings are corrupt', async () => {
    const env = makeEnv()
    await env.kv.put('settings', JSON.stringify({ maxAudioMb: 9999, defaultTtsModel: 'x' }))
    expect((await (await get(env, '/api/admin/config')).json()).settings.maxAudioMb).toBe(25)
  })
})

describe('admin access keys', () => {
  it('shows the plaintext once and never stores or lists it', async () => {
    const env = makeEnv()
    const res = await call(env, '/api/admin/keys', jsonInit('POST', { label: ' laptop ' }))
    expect(res.status).toBe(201)
    const created = await res.json()
    expect(created.key).toMatch(/^ovk_[0-9a-f]{16}_[A-Za-z0-9_-]{43}$/)
    expect(created.label).toBe('laptop')

    const secret = created.key.split('_').slice(2).join('_')
    const stored = JSON.stringify([...env.kv.data.values()])
    expect(stored).not.toContain(secret)

    const listText = await (await get(env, '/api/admin/keys')).text()
    expect(listText).not.toContain(secret)
    expect(JSON.parse(listText).keys).toEqual([{ id: created.id, label: 'laptop', createdAt: created.createdAt }])
  })

  it('rejects an empty label', async () => {
    const res = await call(makeEnv(), '/api/admin/keys', jsonInit('POST', { label: '  ' }))
    expect(res.status).toBe(400)
  })

  it('revokes a key and reports unknown ids as 404', async () => {
    const env = makeEnv()
    const { id } = await (await call(env, '/api/admin/keys', jsonInit('POST', { label: 'x' }))).json()
    const del = await call(env, `/api/admin/keys/${id}`, { method: 'DELETE', headers: bearer(ADMIN_TOKEN) })
    expect(del.status).toBe(204)
    const again = await call(env, `/api/admin/keys/${id}`, { method: 'DELETE', headers: bearer(ADMIN_TOKEN) })
    expect(again.status).toBe(404)
    expect((await (await get(env, '/api/admin/keys')).json()).keys).toEqual([])
  })

  it('caps the number of keys', async () => {
    const env = makeEnv()
    for (let i = 0; i < 50; i++) await call(env, '/api/admin/keys', jsonInit('POST', { label: `k${i}` }))
    const res = await call(env, '/api/admin/keys', jsonInit('POST', { label: 'one-too-many' }))
    expect(res.status).toBe(400)
  })
})
