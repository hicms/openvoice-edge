import { mapLimit } from '../../../shared/concurrency.ts'
import type { TtsModelInfo } from '../../../shared/models.ts'
import { splitText } from '../../../shared/text-split.ts'
import { request } from '@/lib/api'

export interface SpeechParams {
  voice: string
  speed: number
  pitch: number
  volume: number
  style: string
  instructions: string
}

const CLIENT_CONCURRENCY = 2

/**
 * Chunks are sized so each one is a single upstream call, which lets the page show real progress.
 * Dialogue models keep their speaker turns together in one request.
 */
export function chunkSizeFor(model: TtsModelInfo): number {
  if (model.capabilities.dialogue) return Number.POSITIVE_INFINITY
  return model.capabilities.instruction ? 500 : 800
}

export function planChunks(text: string, model: TtsModelInfo): string[] {
  const size = chunkSizeFor(model)
  return Number.isFinite(size) ? splitText(text, size) : [text.trim()].filter(Boolean)
}

export function buildSpeechBody(model: TtsModelInfo, input: string, params: SpeechParams) {
  const { capabilities } = model
  return {
    model: model.id,
    input,
    voice: params.voice,
    speed: params.speed,
    ...(capabilities.pitch && params.pitch !== 0 ? { pitch: params.pitch } : {}),
    ...(capabilities.volume && params.volume !== 0 ? { volume: params.volume } : {}),
    ...(capabilities.style && params.style ? { style: params.style } : {}),
    ...(capabilities.instruction && params.instructions.trim() ? { instructions: params.instructions.trim() } : {}),
  }
}

export interface SynthesizeOptions {
  model: TtsModelInfo
  text: string
  params: SpeechParams
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export async function synthesize({ model, text, params, signal, onProgress }: SynthesizeOptions): Promise<Blob> {
  const chunks = planChunks(text, model)
  let done = 0
  onProgress?.(0, chunks.length)
  const parts = await mapLimit(chunks, CLIENT_CONCURRENCY, async (chunk) => {
    signal?.throwIfAborted()
    const res = await request('/v1/audio/speech', { method: 'POST', json: buildSpeechBody(model, chunk, params), signal })
    const blob = await res.blob()
    onProgress?.(++done, chunks.length)
    return blob
  })
  return new Blob(parts, { type: 'audio/mpeg' })
}
