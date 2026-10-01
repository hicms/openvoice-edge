import { AppError } from '../../../shared/errors.ts'

const ENDPOINT_URL = 'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 Edg/127.0.0.0'
// Public constant embedded in the Microsoft Translator Android app; not a secret of this project.
const SIGNING_KEY =
  'oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw=='
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
const TOKEN_REFRESH_MARGIN_S = 60
const MAX_ATTEMPTS = 3

interface EdgeEndpoint {
  /** Region code used in the TTS host name. */
  r: string
  /** Bearer token for the TTS service. */
  t: string
}

export interface EdgeSpeechOptions {
  voice: string
  /** Percent offsets: rate -50..100, pitch and volume -50..50. */
  rate?: number
  pitch?: number
  volume?: number
  /** Only pass styles the voice supports. */
  style?: string
}

export interface EdgeClientOptions {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export interface RawEdgeVoice {
  ShortName: string
  LocalName?: string
  Locale: string
  Gender: string
  StyleList?: string[]
}

/** XML 1.0 forbids these control characters even when escaped; Edge rejects the whole request if one slips in. */
function stripInvalidXmlChars(text: string): string {
  return Array.from(text)
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d
    })
    .join('')
}

export function escapeXml(text: string): string {
  return stripInvalidXmlChars(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/** `zh-CN-liaoning-XiaobeiNeural` → `zh-CN`. */
export function localeOfVoice(voice: string): string {
  const match = /^([a-z]{2,3}-[A-Z][A-Za-z]{1,3})-/.exec(voice)
  return match ? match[1]! : 'en-US'
}

function signedPercent(value: number): string {
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${rounded}%`
}

export function buildSsml(text: string, options: EdgeSpeechOptions): string {
  const { voice, rate = 0, pitch = 0, volume = 0, style } = options
  const prosody = `<prosody rate="${signedPercent(rate)}" pitch="${signedPercent(pitch)}" volume="${signedPercent(volume)}">${escapeXml(text)}</prosody>`
  const body = style ? `<mstts:express-as style="${escapeXml(style)}">${prosody}</mstts:express-as>` : prosody
  return (
    `<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="${localeOfVoice(voice)}">` +
    `<voice name="${escapeXml(voice)}">${body}</voice></speak>`
  )
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function formatSigningDate(): string {
  return new Date().toUTCString().replace(/GMT/, '').trim().toLowerCase() + ' gmt'
}

async function signEndpointRequest(url: string): Promise<string> {
  const encodedUrl = encodeURIComponent(url.split('://')[1]!)
  const nonce = crypto.randomUUID().replaceAll('-', '')
  const date = formatSigningDate()
  const payload = `MSTranslatorAndroidApp${encodedUrl}${date}${nonce}`.toLowerCase()
  const key = await crypto.subtle.importKey('raw', base64ToBytes(SIGNING_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)))
  return `MSTranslatorAndroidApp::${bytesToBase64(signature)}::${date}::${nonce}`
}

function tokenExpiry(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]!.replaceAll('-', '+').replaceAll('_', '/'))) as { exp?: number }
    return payload.exp ?? 0
  } catch {
    return 0
  }
}

export function createEdgeClient(options: EdgeClientOptions = {}) {
  const doFetch = options.fetch ?? fetch
  const sleep = options.sleep ?? defaultSleep
  const now = options.now ?? Date.now
  let cached: { endpoint: EdgeEndpoint; expiresAt: number } | null = null

  // Concurrent chunks share one in-flight token request instead of each fetching their own.
  let pending: Promise<EdgeEndpoint> | null = null

  function getEndpoint(forceRefresh = false): Promise<EdgeEndpoint> {
    if (!forceRefresh && cached && now() / 1000 < cached.expiresAt - TOKEN_REFRESH_MARGIN_S) {
      return Promise.resolve(cached.endpoint)
    }
    if (pending && !forceRefresh) return pending
    const request = requestEndpoint().finally(() => {
      if (pending === request) pending = null
    })
    pending = request
    return request
  }

  async function requestEndpoint(): Promise<EdgeEndpoint> {
    const res = await doFetch(ENDPOINT_URL, {
      method: 'POST',
      headers: {
        'Accept-Language': 'zh-Hans',
        'X-ClientVersion': '4.0.530a 5fe1dc6c',
        'X-UserId': '0f04d16a175c411e',
        'X-HomeGeographicRegion': 'zh-Hans-CN',
        'X-ClientTraceId': crypto.randomUUID().replaceAll('-', ''),
        'X-MT-Signature': await signEndpointRequest(ENDPOINT_URL),
        'User-Agent': USER_AGENT,
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
    if (!res.ok) throw new AppError('upstream_error', `Edge token request failed (${res.status}).`)
    const endpoint = (await res.json()) as EdgeEndpoint
    if (!endpoint.t || !endpoint.r) throw new AppError('upstream_error', 'Edge token response was malformed.')
    cached = { endpoint, expiresAt: tokenExpiry(endpoint.t) }
    return endpoint
  }

  async function synthesizeChunk(text: string, speech: EdgeSpeechOptions): Promise<ArrayBuffer> {
    const ssml = buildSsml(text, speech)
    let refreshed = false
    for (let attempt = 1; ; attempt++) {
      const last = attempt >= MAX_ATTEMPTS
      try {
        const endpoint = await getEndpoint()
        const res = await doFetch(`https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: 'POST',
          headers: {
            Authorization: endpoint.t,
            'Content-Type': 'application/ssml+xml',
            'User-Agent': USER_AGENT,
            'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
          },
          body: ssml,
        })
        if (res.ok) return await res.arrayBuffer()
        await res.body?.cancel()
        if ((res.status === 401 || res.status === 403) && !refreshed) {
          refreshed = true
          await getEndpoint(true)
          attempt -= 1
          continue
        }
        const retryable = res.status === 429 || res.status >= 500
        if (!retryable || last) {
          throw new AppError(res.status === 429 ? 'upstream_rate_limited' : 'upstream_error', `Edge TTS returned ${res.status}.`)
        }
      } catch (err) {
        if (err instanceof AppError) throw err
        if (last) throw new AppError('upstream_error', 'Could not reach Edge TTS.')
      }
      await sleep(300 * attempt)
    }
  }

  async function listVoices(): Promise<RawEdgeVoice[]> {
    const endpoint = await getEndpoint()
    const res = await doFetch(`https://${endpoint.r}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
      headers: { Authorization: endpoint.t, 'User-Agent': USER_AGENT },
    })
    if (!res.ok) throw new AppError('upstream_error', `Edge voice list returned ${res.status}.`)
    return (await res.json()) as RawEdgeVoice[]
  }

  return { synthesizeChunk, listVoices }
}

export type EdgeClient = ReturnType<typeof createEdgeClient>
