import { describe, expect, it } from 'vitest'
import { formatTranscript } from '../../shared/subtitles.ts'
import { normalizeTranscription } from '../../worker/providers/siliconflow/stt.ts'
import { ADMIN_TOKEN, FakeUpstream, SF_TRANSCRIBE_URL, bearer, call, jsonError, jsonInit, makeEnv, multipart } from './helpers.ts'

const SENSE = 'FunAudioLLM/SenseVoiceSmall'
const XINGCHEN = 'XingChenAGI/XingChenASR-V3.2'
const DIARIZE = 'XingChenAGI/XingChenASR-Diarize-V3.0'
const KEY = 'sk-unit-test-key-0000000000000000AAAA'

// Shapes captured from live SiliconFlow responses (audio content removed).
const SENSE_RAW = { text: '你好，今天过得怎么样？我很好，谢谢你。😊', language: 'Chinese', usage: { type: 'duration', seconds: 5 } }
const XINGCHEN_RAW = { duration: 4.933125, text: '你好，今天过得怎么样？我很好，谢谢你。', usage: { type: 'duration', seconds: 5 } }
const DIARIZE_RAW = {
  duration: 4.933125,
  text: '1: 你好，今天过得怎么样？\n2: 我很好，谢谢你。',
  segments: [
    { type: 'transcript.text.segment', id: '0', start: 0.32, end: 2.56, text: '你好，今天过得怎么样？', speaker: '1' },
    { type: 'transcript.text.segment', id: '1', start: 2.57, end: 4.77, text: '我很好，谢谢你。', speaker: '2' },
  ],
  usage: { type: 'duration', seconds: 5 },
}

const rawFor = (form: FormData): unknown => {
  const model = form.get('model')
  return model === DIARIZE ? DIARIZE_RAW : model === XINGCHEN ? XINGCHEN_RAW : SENSE_RAW
}

const sfUpstream = () => new FakeUpstream().on(SF_TRANSCRIBE_URL, ({ init }) => Response.json(rawFor(init.body as FormData)))

async function transcribe(
  env: ReturnType<typeof makeEnv>,
  fields: Record<string, string>,
  upstream: FakeUpstream,
  file: Parameters<typeof multipart>[1] | null = { name: 'a.mp3', bytes: 2048 },
  token = ADMIN_TOKEN,
) {
  const { body, headers } = await multipart(fields, file ?? undefined)
  return call(env, '/v1/audio/transcriptions', { method: 'POST', body, headers: { ...bearer(token), ...headers } }, upstream)
}

const keyed = () => makeEnv({ SILICONFLOW_API_KEY: KEY })

describe('normalizeTranscription', () => {
  it('handles each model shape', () => {
    expect(normalizeTranscription(SENSE_RAW)).toEqual({ text: SENSE_RAW.text, language: 'Chinese', duration: 5 })
    expect(normalizeTranscription(XINGCHEN_RAW)).toEqual({ text: XINGCHEN_RAW.text, duration: 4.933125 })
    expect(normalizeTranscription(DIARIZE_RAW)).toEqual({
      text: '你好，今天过得怎么样？\n我很好，谢谢你。',
      duration: 4.933125,
      segments: [
        { start: 0.32, end: 2.56, text: '你好，今天过得怎么样？', speaker: '1' },
        { start: 2.57, end: 4.77, text: '我很好，谢谢你。', speaker: '2' },
      ],
    })
  })

  it('drops malformed segments and rejects a body without text', () => {
    const t = normalizeTranscription({ text: 'x', segments: [{ start: 'a' }, null, { start: 0, end: 1, text: ' ok ' }, { start: 1, end: 2, text: '  ' }] })
    expect(t.segments).toEqual([{ start: 0, end: 1, text: 'ok' }])
    expect(() => normalizeTranscription({ nope: 1 })).toThrow()
    expect(() => normalizeTranscription('str')).toThrow()
  })

  it('renders the diarized transcript as SRT with speakers', () => {
    expect(formatTranscript(normalizeTranscription(DIARIZE_RAW), 'srt').body).toContain('00:00:00,320 --> 00:00:02,560\nSpeaker 1: 你好，今天过得怎么样？')
  })
})

describe('POST /v1/audio/transcriptions', () => {
  it('returns {text} by default using the configured default model', async () => {
    const upstream = sfUpstream()
    const res = await transcribe(keyed(), {}, upstream)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ text: SENSE_RAW.text })
    const form = upstream.callsTo(SF_TRANSCRIBE_URL)[0]!.init.body as FormData
    expect(form.get('model')).toBe(SENSE)
    expect((form.get('file') as File).name).toBe('a.mp3')
    expect((upstream.calls[0]!.init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`)
  })

  it('honours the default model changed on the admin page', async () => {
    const upstream = sfUpstream()
    const env = keyed()
    await call(env, '/api/admin/config', jsonInit('PUT', { defaultSttModel: XINGCHEN }))
    await transcribe(env, {}, upstream)
    expect((upstream.callsTo(SF_TRANSCRIBE_URL)[0]!.init.body as FormData).get('model')).toBe(XINGCHEN)
  })

  it('supports verbose_json, text, srt and vtt for the meeting model', async () => {
    const env = keyed()
    const verbose = await (await transcribe(env, { model: DIARIZE, response_format: 'verbose_json' }, sfUpstream())).json()
    expect(verbose.segments).toHaveLength(2)
    expect(verbose.segments[1].speaker).toBe('2')

    const text = await transcribe(env, { model: DIARIZE, response_format: 'text' }, sfUpstream())
    expect(text.headers.get('Content-Type')).toContain('text/plain')
    expect(await text.text()).toBe('你好，今天过得怎么样？\n我很好，谢谢你。')

    const srt = await transcribe(env, { model: DIARIZE, response_format: 'srt' }, sfUpstream())
    expect(srt.headers.get('Content-Type')).toContain('subrip')
    expect(await srt.text()).toContain('1\n00:00:00,320')

    const vtt = await transcribe(env, { model: DIARIZE, response_format: 'vtt' }, sfUpstream())
    expect((await vtt.text()).startsWith('WEBVTT')).toBe(true)
  })

  it('rejects srt/vtt for models without timestamps before calling upstream', async () => {
    const upstream = sfUpstream()
    const res = await transcribe(keyed(), { model: SENSE, response_format: 'srt' }, upstream)
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe('no_timestamps')
    expect(upstream.calls).toHaveLength(0)
  })

  it('rejects files over the limit by Content-Length without reading the body', async () => {
    const upstream = sfUpstream()
    const env = keyed()
    await call(env, '/api/admin/config', jsonInit('PUT', { maxAudioMb: 1 }))
    const res = await call(
      env,
      '/v1/audio/transcriptions',
      { method: 'POST', body: 'x', headers: { ...bearer(ADMIN_TOKEN), 'Content-Type': 'multipart/form-data; boundary=x', 'Content-Length': String(5 * 1024 * 1024) } },
      upstream,
    )
    expect(res.status).toBe(413)
    expect((await res.json()).error.code).toBe('file_too_large')
    expect(upstream.calls).toHaveLength(0)
  })

  it('rejects an actual file over the limit even when the declared size is small', async () => {
    const upstream = sfUpstream()
    const env = keyed()
    await call(env, '/api/admin/config', jsonInit('PUT', { maxAudioMb: 1 }))
    const { body, headers } = await multipart({}, { name: 'big.mp3', bytes: 1024 * 1024 + 10 })
    const res = await call(
      env,
      '/v1/audio/transcriptions',
      { method: 'POST', body, headers: { ...bearer(ADMIN_TOKEN), ...headers, 'Content-Length': '1000' } },
      upstream,
    )
    expect(res.status).toBe(413)
    expect(upstream.calls).toHaveLength(0)
  })

  it('requires Content-Length', async () => {
    const { body, headers } = await multipart({}, { name: 'a.mp3', bytes: 10 })
    const { 'Content-Length': _omit, ...withoutLength } = headers
    const res = await call(keyed(), '/v1/audio/transcriptions', { method: 'POST', body, headers: { ...bearer(ADMIN_TOKEN), ...withoutLength } }, sfUpstream())
    expect(res.status).toBe(400)
  })

  it.each([
    ['missing file', {}, null, 400, 'invalid_request'],
    ['empty file', {}, { name: 'a.mp3', bytes: 0 }, 400, 'invalid_request'],
    ['unknown model', { model: 'whisper-1' }, { name: 'a.mp3', bytes: 10 }, 400, 'unsupported_model'],
    ['bad format', { response_format: 'xml' }, { name: 'a.mp3', bytes: 10 }, 400, 'invalid_request'],
  ] as const)('rejects %s', async (_label, fields, file, status, code) => {
    const upstream = sfUpstream()
    const res = await transcribe(keyed(), { ...fields }, upstream, file && { ...file })
    expect(res.status).toBe(status)
    expect((await res.json()).error.code).toBe(code)
    expect(upstream.calls).toHaveLength(0)
  })

  it('answers 503 when no SiliconFlow key is configured', async () => {
    const upstream = sfUpstream()
    const res = await transcribe(makeEnv(), {}, upstream)
    expect(res.status).toBe(503)
    expect((await res.json()).error.code).toBe('engine_unavailable')
    expect(upstream.calls).toHaveLength(0)
  })

  it('maps XingChen 402 to an actionable balance error without echoing upstream text', async () => {
    const upstream = new FakeUpstream().on(SF_TRANSCRIBE_URL, () => jsonError(402, { code: 30001, message: `balance of ${KEY} is 0` }))
    const res = await transcribe(keyed(), { model: XINGCHEN }, upstream)
    const text = await res.text()
    expect(res.status).toBe(502)
    expect(JSON.parse(text).error.code).toBe('upstream_insufficient_balance')
    expect(text).not.toContain(KEY)
    expect(text).not.toContain('balance of')
  })

  it('treats an unreadable upstream body as an upstream error', async () => {
    const upstream = new FakeUpstream().on(SF_TRANSCRIBE_URL, () => new Response('not json', { status: 200 }))
    const res = await transcribe(keyed(), {}, upstream)
    expect(res.status).toBe(502)
  })

  it('is available to access-key users, not just the admin', async () => {
    const env = keyed()
    const created = await (await call(env, '/api/admin/keys', jsonInit('POST', { label: 'u' }))).json()
    const res = await transcribe(env, {}, sfUpstream(), undefined, created.key)
    expect(res.status).toBe(200)
  })
})
