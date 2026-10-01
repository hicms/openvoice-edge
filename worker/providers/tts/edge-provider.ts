import { AppError } from '../../../shared/errors.ts'
import { splitText } from '../../../shared/text-split.ts'
import { findEdgeVoice } from '../../data/voices.ts'
import { concatBuffers, mapLimit } from '../../lib/concurrency.ts'
import type { EdgeClient } from './edge.ts'
import type { TtsProvider } from './types.ts'

const CHUNK_CHARS = 1500
const CONCURRENCY = 3

/** Edge accepts roughly 0.5x-2x speaking rate. */
function speedToRatePercent(speed: number | undefined): number {
  if (speed === undefined) return 0
  return Math.max(-50, Math.min(100, Math.round((speed - 1) * 100)))
}

export function createEdgeProvider(client: EdgeClient): TtsProvider {
  return {
    async synthesize(request) {
      const voice = findEdgeVoice(request.voice)
      if (!voice) throw new AppError('invalid_request', `Unknown Edge voice: ${request.voice.slice(0, 60)}`)
      // A style the voice does not support would be rejected or ignored upstream, so it is dropped here.
      const style = request.style && voice.styles?.includes(request.style) ? request.style : undefined
      const chunks = splitText(request.text, CHUNK_CHARS)
      if (chunks.length === 0) throw new AppError('invalid_request', 'Input text is empty.')
      const parts = await mapLimit(chunks, CONCURRENCY, (chunk) =>
        client.synthesizeChunk(chunk, {
          voice: voice.id,
          rate: speedToRatePercent(request.speed),
          pitch: request.pitch,
          volume: request.volume,
          style,
        }),
      )
      return concatBuffers(parts)
    },
  }
}
