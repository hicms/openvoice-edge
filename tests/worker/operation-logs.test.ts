import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_TOKEN, bearer, call, createUserKey, edgeUpstream, FakeLimiter, FakeUpstream,
  jsonError, jsonInit, makeEnv, multipart, SF_SPEECH_URL, SF_TRANSCRIBE_URL,
} from './helpers.ts'

const getLogs = (env: ReturnType<typeof makeEnv>, query = '') =>
  call(env, `/api/admin/logs${query}`, { headers: bearer(ADMIN_TOKEN) })

describe('operation logs', () => {
  it('starts empty and is restricted to administrators', async () => {
    const env = makeEnv()
    const user = await createUserKey(env)
    expect((await call(env, '/api/admin/logs')).status).toBe(401)
    expect((await call(env, '/api/admin/logs', { headers: bearer(user) })).status).toBe(403)
    const res = await getLogs(env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ logs: [], cursor: null })
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('records a successful speech request without the text or credentials', async () => {
    const env = makeEnv()
    const res = await call(env, '/v1/audio/speech', jsonInit('POST', { input: 'private speech content' }), edgeUpstream())
    expect(res.status).toBe(200)
    const response = await getLogs(env)
    const body = await response.json()
    expect(body.logs).toHaveLength(1)
    expect(body.logs[0]).toMatchObject({
      kind: 'speech', status: 'success', model: 'edge-tts', actor: { id: 'admin' }, inputChars: 22,
    })
    expect(body.logs[0].durationMs).toBeGreaterThanOrEqual(0)
    expect(Number.isNaN(Date.parse(body.logs[0].createdAt))).toBe(false)
    const stored = JSON.stringify([...env.kv.data.values()])
    expect(stored).not.toContain('private speech content')
    expect(stored).not.toContain(ADMIN_TOKEN)
  })

  it('keeps the verified access-key label and ID after revocation', async () => {
    const env = makeEnv()
    const key = await createUserKey(env, 'Phone')
    const id = key.split('_')[1]!
    await call(env, '/v1/audio/speech', jsonInit('POST', { input: 'hello' }, key), edgeUpstream())
    await call(env, `/api/admin/keys/${id}`, { method: 'DELETE', headers: bearer(ADMIN_TOKEN) })
    const { logs } = await (await getLogs(env)).json()
    expect(logs[0].actor).toEqual({ id: `ak:${id}`, label: 'Phone' })
    expect(JSON.stringify(logs)).not.toContain(key)
  })

  it('records transcription size, but not the filename, audio or transcript', async () => {
    const env = makeEnv({ SILICONFLOW_API_KEY: 'private-provider-key' })
    const upstream = new FakeUpstream().on(SF_TRANSCRIBE_URL, () => Response.json({ text: 'private transcript' }))
    const form = await multipart({}, { name: 'private-meeting.mp3', bytes: 123 })
    const res = await call(env, '/v1/audio/transcriptions', { method: 'POST', ...form, headers: { ...form.headers, ...bearer(ADMIN_TOKEN) } }, upstream)
    expect(res.status).toBe(200)
    const { logs } = await (await getLogs(env)).json()
    expect(logs[0]).toMatchObject({ kind: 'transcription', status: 'success', model: 'FunAudioLLM/SenseVoiceSmall', audioBytes: 123 })
    const stored = JSON.stringify([...env.kv.data.values()])
    for (const privateValue of ['private-provider-key', 'private-meeting.mp3', 'private transcript']) expect(stored).not.toContain(privateValue)
  })

  it('records only the safe upstream error code and canonical model', async () => {
    const env = makeEnv({ SILICONFLOW_API_KEY: 'private-provider-key' })
    const upstream = new FakeUpstream().on(SF_SPEECH_URL, () => jsonError(402, { message: 'private upstream body' }))
    const res = await call(env, '/v1/audio/speech', jsonInit('POST', {
      model: 'FunAudioLLM/CosyVoice2-0.5B', input: 'private speech', instructions: 'private instructions',
    }), upstream)
    expect(res.status).toBe(502)
    const { logs } = await (await getLogs(env)).json()
    expect(logs[0]).toMatchObject({ status: 'failed', errorCode: 'upstream_insufficient_balance', model: 'FunAudioLLM/CosyVoice2-0.5B' })
    expect(JSON.stringify([...env.kv.data.values()])).not.toContain('private')
  })

  it('records invalid bodies and unknown models without persisting arbitrary values', async () => {
    const env = makeEnv()
    await call(env, '/v1/audio/speech', jsonInit('POST', { input: 'hello', model: 'private-model-value' }))
    await call(env, '/v1/audio/speech', { method: 'POST', headers: bearer(ADMIN_TOKEN), body: 'private-invalid-json' })
    const { logs } = await (await getLogs(env)).json()
    expect(logs).toHaveLength(2)
    expect(logs.map((log: { errorCode: string }) => log.errorCode).sort()).toEqual(['invalid_request', 'unsupported_model'])
    expect(logs.every((log: { model?: string }) => !log.model)).toBe(true)
    expect(JSON.stringify([...env.kv.data.values()])).not.toContain('private')
  })

  it('does not log unrelated routes, unauthenticated requests or pre-route throttling', async () => {
    const env = makeEnv()
    await getLogs(env)
    await call(env, '/api/health')
    await call(env, '/v1/audio/speech', { headers: bearer(ADMIN_TOKEN) })
    await call(env, '/v1/audio/speech', jsonInit('POST', { input: 'hello' }, 'wrong'))
    env.USER_LIMITER = new FakeLimiter(0) as unknown as RateLimit
    expect((await call(env, '/v1/audio/speech', jsonInit('POST', { input: 'hello' }))).status).toBe(429)
    expect(env.kv.data.size).toBe(0)
  })

  it('does not change success or failure responses when log storage fails', async () => {
    const env = makeEnv()
    const telemetry = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(env.kv, 'put').mockRejectedValue(new Error('private storage failure'))
    try {
      const success = await call(env, '/v1/audio/speech', jsonInit('POST', { input: 'hello' }), edgeUpstream())
      expect(success.status).toBe(200)
      const failure = await call(env, '/v1/audio/speech', jsonInit('POST', { input: '' }))
      expect(failure.status).toBe(400)
      expect((await failure.json()).error.code).toBe('invalid_request')
      expect(telemetry).toHaveBeenCalledTimes(2)
      expect(JSON.stringify(telemetry.mock.calls)).not.toContain('private storage failure')
    } finally {
      telemetry.mockRestore()
    }
  })

  it.each(['?kind=unknown', '?status=unknown', '?cursor='])('rejects invalid log queries %s', async (query) => {
    expect((await getLogs(makeEnv(), query)).status).toBe(400)
  })
})
