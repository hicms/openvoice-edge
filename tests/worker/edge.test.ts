import { describe, expect, it } from 'vitest'
import { EDGE_VOICES } from '../../worker/data/voices.ts'
import { buildSsml, createEdgeClient, localeOfVoice } from '../../worker/providers/tts/edge.ts'
import {
  ADMIN_TOKEN,
  EDGE_SPEECH_URL,
  EDGE_TOKEN_URL,
  FakeUpstream,
  audioResponse,
  bearer,
  call,
  edgeUpstream,
  jsonInit,
  makeEnv,
} from './helpers.ts'

const speech = (env: ReturnType<typeof makeEnv>, body: object, upstream: FakeUpstream) =>
  call(env, '/v1/audio/speech', jsonInit('POST', { model: 'edge-tts', ...body }), upstream)

const ssmlOf = (upstream: FakeUpstream, i = 0) => String(upstream.callsTo(EDGE_SPEECH_URL)[i]!.init.body)

describe('SSML', () => {
  it('takes the language from the voice, not a fixed zh-CN', () => {
    expect(localeOfVoice('en-US-AriaNeural')).toBe('en-US')
    expect(localeOfVoice('zh-CN-liaoning-XiaobeiNeural')).toBe('zh-CN')
    expect(localeOfVoice('fil-PH-BlessicaNeural')).toBe('fil-PH')
    expect(buildSsml('hi', { voice: 'en-GB-SoniaNeural' })).toContain('xml:lang="en-GB"')
  })

  it('escapes text and omits the style wrapper and style degree by default', () => {
    const ssml = buildSsml(`a & b <c> "d" 'e'`, { voice: 'en-US-AriaNeural' })
    expect(ssml).toContain('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')
    expect(ssml).not.toContain('express-as')
    expect(ssml).not.toContain('styledegree')
    expect(ssml).toContain('rate="+0%" pitch="+0%" volume="+0%"')
  })

  it('wraps in express-as only when a style is given and formats signed percents', () => {
    const ssml = buildSsml('hi', { voice: 'zh-CN-XiaoxiaoNeural', style: 'cheerful', rate: -20, pitch: 5, volume: 0 })
    expect(ssml).toContain('<mstts:express-as style="cheerful">')
    expect(ssml).toContain('rate="-20%" pitch="+5%" volume="+0%"')
  })
})

describe('voice snapshot', () => {
  it('contains safe ids and the default voice', () => {
    expect(EDGE_VOICES.length).toBeGreaterThan(100)
    expect(EDGE_VOICES.every((v) => /^[A-Za-z0-9-]+$/.test(v.id))).toBe(true)
    expect(EDGE_VOICES.some((v) => v.id === 'zh-CN-XiaoxiaoNeural')).toBe(true)
    expect(EDGE_VOICES.some((v) => v.locale === 'en-US')).toBe(true)
  })
})

describe('POST /v1/audio/speech with Edge TTS', () => {
  it('returns MP3 bytes and uses the voice locale', async () => {
    const upstream = edgeUpstream()
    const res = await speech(makeEnv(), { input: 'Hello world', voice: 'en-US-AriaNeural' }, upstream)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('audio/mpeg')
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0)
    expect(ssmlOf(upstream)).toContain('xml:lang="en-US"')
  })

  it('uses the configured default voice and keeps ！？ untouched', async () => {
    const upstream = edgeUpstream()
    await speech(makeEnv(), { input: '真的吗？太好了！' }, upstream)
    expect(ssmlOf(upstream)).toContain('<voice name="zh-CN-XiaoxiaoNeural">')
    expect(ssmlOf(upstream)).toContain('真的吗？太好了！')
  })

  it('maps speed to rate and passes pitch and volume', async () => {
    const upstream = edgeUpstream()
    await speech(makeEnv(), { input: 'hi', speed: 1.5, pitch: -10, volume: 20 }, upstream)
    expect(ssmlOf(upstream)).toContain('rate="+50%" pitch="-10%" volume="+20%"')
  })

  it('applies a style only when the voice supports it', async () => {
    const upstream = edgeUpstream()
    const env = makeEnv()
    await speech(env, { input: 'hi', voice: 'zh-CN-XiaoxiaoNeural', style: 'cheerful' }, upstream)
    await speech(env, { input: 'hi', voice: 'zh-CN-XiaoxiaoNeural', style: 'made-up-style' }, upstream)
    expect(ssmlOf(upstream, 0)).toContain('style="cheerful"')
    expect(ssmlOf(upstream, 1)).not.toContain('express-as')
  })

  it('splits long text into ordered chunks and requests the token once', async () => {
    const upstream = edgeUpstream()
    const text = '第一句话在这里。'.repeat(400)
    const res = await speech(makeEnv(), { input: text }, upstream)
    expect(res.status).toBe(200)
    const chunks = upstream.callsTo(EDGE_SPEECH_URL)
    expect(chunks.length).toBeGreaterThan(1)
    expect(upstream.callsTo(EDGE_TOKEN_URL)).toHaveLength(1)
    const sent = chunks.map((c) => String(c.init.body).match(/>([^<]+)<\/prosody>/)![1]).join('')
    expect(sent).toBe(text)
  })

  it('rejects text over the configured limit before calling upstream', async () => {
    const upstream = edgeUpstream()
    const env = makeEnv()
    await call(env, '/api/admin/config', jsonInit('PUT', { maxTtsChars: 100 }))
    const res = await speech(env, { input: 'a'.repeat(101) }, upstream)
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('text_too_long')
    expect(upstream.calls).toHaveLength(0)
  })

  it.each([
    [{ input: 'hi', voice: 'zh-CN-NoSuchNeural' }, 'invalid_request'],
    [{ input: 'hi', voice: 'x"><injected/>' }, 'invalid_request'],
    [{ input: '   ' }, 'invalid_request'],
    [{ input: 'hi', model: 'tts-1' }, 'unsupported_model'],
    [{ input: 'hi', speed: 9 }, 'invalid_request'],
  ])('rejects %j with %s', async (body, code) => {
    const res = await call(makeEnv(), '/v1/audio/speech', jsonInit('POST', { model: 'edge-tts', ...body }), edgeUpstream())
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe(code)
  })

  it('requires authentication', async () => {
    const res = await call(makeEnv(), '/v1/audio/speech', { method: 'POST', body: '{}' }, edgeUpstream())
    expect(res.status).toBe(401)
  })
})

describe('Edge client resilience', () => {
  const sleep = async () => {}

  it('retries 5xx and then succeeds', async () => {
    let attempts = 0
    const upstream = edgeUpstream().on(EDGE_SPEECH_URL, () => (++attempts < 3 ? new Response('boom', { status: 503 }) : audioResponse('ok')))
    const client = createEdgeClient({ fetch: upstream.fetch, sleep })
    expect(await client.synthesizeChunk('hi', { voice: 'en-US-AriaNeural' })).toBeInstanceOf(ArrayBuffer)
    expect(attempts).toBe(3)
  })

  it('gives up on persistent 429 with a rate-limit error', async () => {
    const upstream = edgeUpstream().on(EDGE_SPEECH_URL, () => new Response('slow down', { status: 429 }))
    const client = createEdgeClient({ fetch: upstream.fetch, sleep })
    await expect(client.synthesizeChunk('hi', { voice: 'en-US-AriaNeural' })).rejects.toMatchObject({ code: 'upstream_rate_limited' })
    expect(upstream.callsTo(EDGE_SPEECH_URL)).toHaveLength(3)
  })

  it('does not retry other 4xx', async () => {
    const upstream = edgeUpstream().on(EDGE_SPEECH_URL, () => new Response('bad', { status: 400 }))
    const client = createEdgeClient({ fetch: upstream.fetch, sleep })
    await expect(client.synthesizeChunk('hi', { voice: 'en-US-AriaNeural' })).rejects.toMatchObject({ code: 'upstream_error' })
    expect(upstream.callsTo(EDGE_SPEECH_URL)).toHaveLength(1)
  })

  it('refreshes the token once after a 401', async () => {
    let first = true
    const upstream = edgeUpstream().on(EDGE_SPEECH_URL, () => {
      if (first) {
        first = false
        return new Response('expired', { status: 401 })
      }
      return audioResponse('ok')
    })
    const client = createEdgeClient({ fetch: upstream.fetch, sleep })
    await client.synthesizeChunk('hi', { voice: 'en-US-AriaNeural' })
    expect(upstream.callsTo(EDGE_TOKEN_URL)).toHaveLength(2)
  })

  it('reports an unreachable service without leaking the cause', async () => {
    const upstream = edgeUpstream().on(EDGE_SPEECH_URL, () => {
      throw new TypeError('fetch failed: secret-host.internal')
    })
    const client = createEdgeClient({ fetch: upstream.fetch, sleep })
    const err = await client.synthesizeChunk('hi', { voice: 'en-US-AriaNeural' }).catch((e: Error) => e)
    expect(err).toMatchObject({ code: 'upstream_error' })
    expect((err as Error).message).not.toContain('secret-host')
  })

  it('re-requests the token after it expires', async () => {
    let clock = Date.now()
    const upstream = edgeUpstream()
    const client = createEdgeClient({ fetch: upstream.fetch, sleep, now: () => clock })
    await client.synthesizeChunk('a', { voice: 'en-US-AriaNeural' })
    await client.synthesizeChunk('b', { voice: 'en-US-AriaNeural' })
    expect(upstream.callsTo(EDGE_TOKEN_URL)).toHaveLength(1)
    clock += 11 * 60 * 1000
    await client.synthesizeChunk('c', { voice: 'en-US-AriaNeural' })
    expect(upstream.callsTo(EDGE_TOKEN_URL)).toHaveLength(2)
  })
})

describe('GET /v1/voices', () => {
  it('lists Edge voices by default with styles for supporting voices', async () => {
    const res = await call(makeEnv(), '/v1/voices', { headers: bearer(ADMIN_TOKEN) })
    const body = await res.json()
    expect(body.model).toBe('edge-tts')
    expect(body.voices.length).toBe(EDGE_VOICES.length)
    expect(body.voices.find((v: { id: string }) => v.id === 'zh-CN-XiaoxiaoNeural').styles).toContain('cheerful')
  })

  it('lists preset voices for SiliconFlow models and rejects unknown models', async () => {
    const env = makeEnv()
    const sf = await (await call(env, '/v1/voices?model=fnlp/MOSS-TTSD-v0.5', { headers: bearer(ADMIN_TOKEN) })).json()
    expect(sf.voices.map((v: { id: string }) => v.id)).toContain('alex')
    expect((await call(env, '/v1/voices?model=nope', { headers: bearer(ADMIN_TOKEN) })).status).toBe(400)
  })
})
