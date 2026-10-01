import { describe, expect, it } from 'vitest'
import {
  FakeUpstream,
  SF_SPEECH_URL,
  audioResponse,
  call,
  jsonError,
  jsonInit,
  makeEnv,
} from './helpers.ts'

const COSY = 'FunAudioLLM/CosyVoice2-0.5B'
const MOSS = 'fnlp/MOSS-TTSD-v0.5'
const KEY = 'sk-unit-test-key-0000000000000000AAAA'

const sfUpstream = () => new FakeUpstream().on(SF_SPEECH_URL, ({ init }) => audioResponse(`sf:${String(init.body).length}`))
const speech = (env: ReturnType<typeof makeEnv>, body: object, upstream: FakeUpstream) =>
  call(env, '/v1/audio/speech', jsonInit('POST', body), upstream)
const sent = (upstream: FakeUpstream, i = 0) => JSON.parse(String(upstream.callsTo(SF_SPEECH_URL)[i]!.init.body))

describe('SiliconFlow TTS', () => {
  it('answers 503 engine_unavailable when no key is configured and never calls upstream', async () => {
    const upstream = sfUpstream()
    const res = await speech(makeEnv(), { model: COSY, input: 'hi' }, upstream)
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('engine_unavailable')
    expect(upstream.calls).toHaveLength(0)
  })

  it('forwards CosyVoice2 with the model-prefixed voice and bearer key', async () => {
    const upstream = sfUpstream()
    const res = await speech(makeEnv({ SILICONFLOW_API_KEY: KEY }), { model: COSY, input: '你好', voice: 'anna', speed: 1.2 }, upstream)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    const call0 = upstream.callsTo(SF_SPEECH_URL)[0]!
    expect((call0.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
    expect(sent(upstream)).toEqual({ model: COSY, input: '你好', voice: `${COSY}:anna`, speed: 1.2, response_format: 'mp3' })
  })

  it('prefers a key saved on the admin page over the env bootstrap key', async () => {
    const upstream = sfUpstream()
    const env = makeEnv({ SILICONFLOW_API_KEY: 'sk-env-key-1111' })
    await call(env, '/api/admin/config', jsonInit('PUT', { siliconflowApiKey: 'sk-kv-key-2222' }))
    await speech(env, { model: COSY, input: 'hi' }, upstream)
    expect((upstream.callsTo(SF_SPEECH_URL)[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-kv-key-2222')
  })

  it('accepts the SiliconFlow "<model>:name" voice spelling and the configured default voice', async () => {
    const upstream = sfUpstream()
    const env = makeEnv({ SILICONFLOW_API_KEY: KEY })
    await speech(env, { model: COSY, input: 'hi', voice: `${COSY}:david` }, upstream)
    await speech(env, { model: COSY, input: 'hi' }, upstream)
    expect(sent(upstream, 0).voice).toBe(`${COSY}:david`)
    expect(sent(upstream, 1).voice).toBe(`${COSY}:alex`)
  })

  it('puts the tone instruction before <|endofprompt|> in every chunk', async () => {
    const upstream = sfUpstream()
    const text = '今天天气很好，我们去公园吧。'.repeat(120)
    await speech(makeEnv({ SILICONFLOW_API_KEY: KEY }), { model: COSY, input: text, instructions: '请用开心的语气说' }, upstream)
    const calls = upstream.callsTo(SF_SPEECH_URL)
    expect(calls.length).toBeGreaterThan(1)
    for (let i = 0; i < calls.length; i++) expect(sent(upstream, i).input.startsWith('请用开心的语气说<|endofprompt|>')).toBe(true)
    const joined = calls.map((_, i) => sent(upstream, i).input.replace('请用开心的语气说<|endofprompt|>', '')).join('')
    expect(joined).toBe(text)
  })

  it('does not add a prefix without instructions', async () => {
    const upstream = sfUpstream()
    await speech(makeEnv({ SILICONFLOW_API_KEY: KEY }), { model: COSY, input: '你好' }, upstream)
    expect(sent(upstream).input).toBe('你好')
  })

  it('rejects control tokens in text or instructions', async () => {
    const env = makeEnv({ SILICONFLOW_API_KEY: KEY })
    for (const body of [{ input: 'a<|endofprompt|>b' }, { input: 'hi', instructions: 'x<|endofprompt|>' }]) {
      const upstream = sfUpstream()
      const res = await speech(env, { model: COSY, ...body }, upstream)
      expect(res.status).toBe(400)
      expect(upstream.calls).toHaveLength(0)
    }
  })

  it('sends MOSS-TTSD dialogue as one request and tags plain text as speaker 1', async () => {
    const upstream = sfUpstream()
    const env = makeEnv({ SILICONFLOW_API_KEY: KEY })
    await speech(env, { model: MOSS, input: '[S1]你好。[S2]你好呀。' }, upstream)
    await speech(env, { model: MOSS, input: '只有一个人说话' }, upstream)
    expect(sent(upstream, 0)).toMatchObject({ model: MOSS, input: '[S1]你好。[S2]你好呀。', voice: `${MOSS}:alex` })
    expect(sent(upstream, 1).input).toBe('[S1]只有一个人说话')
  })

  it('ignores parameters the model does not support', async () => {
    const upstream = sfUpstream()
    await speech(makeEnv({ SILICONFLOW_API_KEY: KEY }), { model: MOSS, input: '[S1]hi', pitch: 20, volume: 10, style: 'cheerful', instructions: 'x' }, upstream)
    expect(Object.keys(sent(upstream)).sort()).toEqual(['input', 'model', 'response_format', 'voice'])
  })

  it('rejects voices that are not SiliconFlow presets', async () => {
    const upstream = sfUpstream()
    const res = await speech(makeEnv({ SILICONFLOW_API_KEY: KEY }), { model: COSY, input: 'hi', voice: 'zh-CN-XiaoxiaoNeural' }, upstream)
    expect(res.status).toBe(400)
    expect(upstream.calls).toHaveLength(0)
  })

  it.each([
    [401, 'upstream_auth_failed', 502],
    [402, 'upstream_insufficient_balance', 502],
    [429, 'upstream_rate_limited', 429],
    [500, 'upstream_error', 502],
    [400, 'upstream_error', 502],
  ])('maps upstream %i to %s without echoing the upstream message or the key', async (status, code, httpStatus) => {
    const upstream = new FakeUpstream().on(SF_SPEECH_URL, () => jsonError(status, { code: 20052, message: `echo ${KEY} private text` }))
    const res = await speech(makeEnv({ SILICONFLOW_API_KEY: KEY }), { model: COSY, input: 'secret user text' }, upstream)
    const text = await res.text()
    expect(res.status).toBe(httpStatus)
    expect(JSON.parse(text).error.code).toBe(code)
    expect(text).toContain(`HTTP ${status}`)
    for (const forbidden of [KEY, 'private text', 'secret user text']) expect(text).not.toContain(forbidden)
  })

  it('treats a non-audio 200 response as an upstream error', async () => {
    const upstream = new FakeUpstream().on(SF_SPEECH_URL, () => Response.json({ ok: true }))
    const res = await speech(makeEnv({ SILICONFLOW_API_KEY: KEY }), { model: COSY, input: 'hi' }, upstream)
    expect(res.status).toBe(502)
  })

  it('reports a network failure without the underlying message', async () => {
    const upstream = new FakeUpstream().on(SF_SPEECH_URL, () => {
      throw new TypeError('connect ECONNREFUSED 10.0.0.1')
    })
    const res = await speech(makeEnv({ SILICONFLOW_API_KEY: KEY }), { model: COSY, input: 'hi' }, upstream)
    expect(res.status).toBe(502)
    expect(await res.text()).not.toContain('10.0.0.1')
  })
})
