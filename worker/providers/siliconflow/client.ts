import { AppError } from '../../../shared/errors.ts'

const BASE_URL = 'https://api.siliconflow.cn/v1'

/**
 * Maps an upstream failure to a stable code. Only the HTTP status and SiliconFlow's numeric code
 * are surfaced; the upstream message is dropped because it can echo request content.
 */
export async function upstreamError(res: Response): Promise<AppError> {
  let upstreamCode = ''
  try {
    const body = (await res.json()) as { code?: unknown }
    if (typeof body.code === 'number') upstreamCode = `, code ${body.code}`
  } catch {
    // Non-JSON error bodies carry nothing we want to forward.
  }
  const detail = `(HTTP ${res.status}${upstreamCode})`
  switch (res.status) {
    case 401:
      return new AppError('upstream_auth_failed', `SiliconFlow rejected the API key ${detail}. Update it on the Admin page.`)
    case 402:
      return new AppError('upstream_insufficient_balance', `SiliconFlow account balance is insufficient ${detail}.`)
    case 429:
      return new AppError('upstream_rate_limited', `SiliconFlow rate limit reached ${detail}. Try again shortly.`)
    default:
      return new AppError('upstream_error', `SiliconFlow request failed ${detail}.`)
  }
}

export interface SpeechPayload {
  model: string
  input: string
  voice: string
  speed?: number
}

export function createSiliconflowClient(doFetch: typeof fetch = fetch) {
  async function call(apiKey: string, path: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await doFetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${apiKey}` },
      })
    } catch {
      throw new AppError('upstream_error', 'Could not reach SiliconFlow.')
    }
    if (!res.ok) throw await upstreamError(res)
    return res
  }

  return {
    async speech(apiKey: string, payload: SpeechPayload): Promise<ArrayBuffer> {
      const res = await call(apiKey, '/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, response_format: 'mp3' }),
      })
      if (!res.headers.get('content-type')?.includes('audio')) {
        throw new AppError('upstream_error', 'SiliconFlow returned a non-audio response.')
      }
      return res.arrayBuffer()
    },

    async transcribe(apiKey: string, file: File, model: string): Promise<unknown> {
      const form = new FormData()
      form.append('file', file, file.name)
      form.append('model', model)
      const res = await call(apiKey, '/audio/transcriptions', { method: 'POST', body: form })
      try {
        return await res.json()
      } catch {
        throw new AppError('upstream_error', 'SiliconFlow returned an unreadable transcription.')
      }
    },
  }
}

export type SiliconflowClient = ReturnType<typeof createSiliconflowClient>
