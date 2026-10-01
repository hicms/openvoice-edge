import { AppError } from '../../../shared/errors.ts'
import type { Transcript, TranscriptSegment } from '../../../shared/subtitles.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseSegment(value: unknown): TranscriptSegment | null {
  if (!isRecord(value)) return null
  const { start, end, text, speaker } = value
  if (typeof start !== 'number' || typeof end !== 'number' || typeof text !== 'string') return null
  const segment: TranscriptSegment = { start, end, text: text.trim() }
  if (typeof speaker === 'string' || typeof speaker === 'number') segment.speaker = String(speaker)
  return segment
}

/**
 * Upstream shapes differ per model: some add `language`, some `duration` or `usage.seconds`, and the
 * diarization model adds `segments` (and prefixes `text` with "1: " style speaker labels). Everything
 * downstream sees one shape.
 */
export function normalizeTranscription(raw: unknown): Transcript {
  if (!isRecord(raw) || typeof raw.text !== 'string') {
    throw new AppError('upstream_error', 'SiliconFlow returned an unexpected transcription format.')
  }
  const segments = Array.isArray(raw.segments)
    ? raw.segments.map(parseSegment).filter((s): s is TranscriptSegment => s !== null && s.text !== '')
    : []
  const usageSeconds = isRecord(raw.usage) && typeof raw.usage.seconds === 'number' ? raw.usage.seconds : undefined
  const duration = typeof raw.duration === 'number' ? raw.duration : usageSeconds

  const transcript: Transcript = { text: segments.length ? segments.map((s) => s.text).join('\n') : raw.text.trim() }
  if (typeof raw.language === 'string') transcript.language = raw.language
  if (duration !== undefined) transcript.duration = duration
  if (segments.length) transcript.segments = segments
  return transcript
}
