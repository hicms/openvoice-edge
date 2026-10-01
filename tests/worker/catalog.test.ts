import { describe, expect, it } from 'vitest'
import { ADMIN_TOKEN, bearer, call, createUserKey, jsonInit, makeEnv } from './helpers.ts'

const KEY = 'sk-unit-test-key-0000000000000000AAAA'
const get = (env: ReturnType<typeof makeEnv>, path: string, token = ADMIN_TOKEN) => call(env, path, { headers: bearer(token) })

describe('GET /v1/models', () => {
  it('lists only Edge when no SiliconFlow key is configured', async () => {
    const body = await (await get(makeEnv(), '/v1/models')).json()
    expect(body.object).toBe('list')
    expect(body.data).toEqual([{ id: 'edge-tts', object: 'model', owned_by: 'openvoice-edge', type: 'tts' }])
  })

  it('lists every TTS and STT model once a key is configured', async () => {
    const body = await (await get(makeEnv({ SILICONFLOW_API_KEY: KEY }), '/v1/models')).json()
    expect(body.data.map((m: { id: string }) => m.id)).toEqual([
      'edge-tts',
      'FunAudioLLM/CosyVoice2-0.5B',
      'fnlp/MOSS-TTSD-v0.5',
      'FunAudioLLM/SenseVoiceSmall',
      'XingChenAGI/XingChenASR-V3.2',
      'XingChenAGI/XingChenASR-Diarize-V3.0',
    ])
  })
})

describe('GET /api/config', () => {
  it('shows Edge only, no STT, and a working default when no key is set', async () => {
    const body = await (await get(makeEnv(), '/api/config')).json()
    expect(body.ttsModels.map((m: { id: string }) => m.id)).toEqual(['edge-tts'])
    expect(body.sttModels).toEqual([])
    expect(body.defaults.defaultTtsModel).toBe('edge-tts')
    expect(body.limits).toEqual({ maxTtsChars: 5000, maxAudioMb: 25 })
  })

  it('exposes capabilities and scenarios the UI needs', async () => {
    const body = await (await get(makeEnv({ SILICONFLOW_API_KEY: KEY }), '/api/config')).json()
    const byId = Object.fromEntries(body.ttsModels.map((m: { id: string }) => [m.id, m]))
    expect(byId['FunAudioLLM/CosyVoice2-0.5B'].capabilities.instruction).toBe(true)
    expect(byId['fnlp/MOSS-TTSD-v0.5'].capabilities.dialogue).toBe(true)
    expect(body.sttModels.map((m: { scenario: string }) => m.scenario)).toEqual(['fast', 'dialect', 'meeting'])
  })

  it('falls back when the configured default engine needs a key that is gone', async () => {
    const env = makeEnv({ SILICONFLOW_API_KEY: KEY })
    await call(env, '/api/admin/config', jsonInit('PUT', { defaultTtsModel: 'fnlp/MOSS-TTSD-v0.5' }))
    env.SILICONFLOW_API_KEY = undefined
    expect((await (await get(env, '/api/config')).json()).defaults.defaultTtsModel).toBe('edge-tts')
  })

  it('never contains key material and is readable by access-key users', async () => {
    const env = makeEnv({ SILICONFLOW_API_KEY: KEY })
    const userKey = await createUserKey(env)
    const res = await get(env, '/api/config', userKey)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(KEY)
    expect(text).not.toContain(ADMIN_TOKEN)
    expect(text).not.toMatch(/configured|last4|source/)
  })
})
