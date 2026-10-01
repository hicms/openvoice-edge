import { AppError } from './errors.ts'
import type { TranscriptionFormat } from './schemas.ts'

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  speaker?: string
}

export interface Transcript {
  text: string
  language?: string
  duration?: number
  segments?: TranscriptSegment[]
}

export type SpeakerLabel = (speaker: string) => string

const defaultLabel: SpeakerLabel = (speaker) => `Speaker ${speaker}`

export function formatTimestamp(seconds: number, millisSeparator: ',' | '.'): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalSeconds = (totalMs - ms) / 1000
  const s = totalSeconds % 60
  const m = Math.floor(totalSeconds / 60) % 60
  const h = Math.floor(totalSeconds / 3600)
  const pad = (n: number, width = 2) => String(n).padStart(width, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}${millisSeparator}${pad(ms, 3)}`
}

function cueText(segment: TranscriptSegment, label: SpeakerLabel): string {
  return segment.speaker ? `${label(segment.speaker)}: ${segment.text}` : segment.text
}

export function toSrt(segments: TranscriptSegment[], label: SpeakerLabel = defaultLabel): string {
  return segments
    .map(
      (seg, i) =>
        `${i + 1}\n${formatTimestamp(seg.start, ',')} --> ${formatTimestamp(seg.end, ',')}\n${cueText(seg, label)}\n`,
    )
    .join('\n')
}

export function toVtt(segments: TranscriptSegment[], label: SpeakerLabel = defaultLabel): string {
  const cues = segments.map(
    (seg) => `${formatTimestamp(seg.start, '.')} --> ${formatTimestamp(seg.end, '.')}\n${cueText(seg, label)}\n`,
  )
  return `WEBVTT\n\n${cues.join('\n')}`
}

export function toPlainText(transcript: Transcript, label: SpeakerLabel = defaultLabel): string {
  const { segments } = transcript
  if (!segments?.some((s) => s.speaker)) return transcript.text
  return segments.map((seg) => cueText(seg, label)).join('\n')
}

export function toMarkdown(transcript: Transcript, label: SpeakerLabel = defaultLabel): string {
  const { segments } = transcript
  if (!segments?.some((s) => s.speaker)) return transcript.text
  return segments
    .map((seg) => {
      const stamp = formatTimestamp(seg.start, '.').slice(0, 8)
      return seg.speaker ? `**${label(seg.speaker)}** \`${stamp}\`\n\n${seg.text}` : seg.text
    })
    .join('\n\n')
}

export function toJson(transcript: Transcript): string {
  return JSON.stringify(transcript, null, 2)
}

export interface FormattedTranscript {
  contentType: string
  body: string
}

/** Renders a transcript for the OpenAI-compatible `response_format` values. */
export function formatTranscript(transcript: Transcript, format: TranscriptionFormat): FormattedTranscript {
  switch (format) {
    case 'json':
      return { contentType: 'application/json', body: JSON.stringify({ text: transcript.text }) }
    case 'verbose_json':
      return { contentType: 'application/json', body: JSON.stringify(transcript) }
    case 'text':
      return { contentType: 'text/plain; charset=utf-8', body: transcript.text }
    case 'srt':
    case 'vtt': {
      if (!transcript.segments?.length) {
        throw new AppError('no_timestamps', 'The selected model does not return timestamps; use XingChenASR-Diarize.')
      }
      return format === 'srt'
        ? { contentType: 'application/x-subrip; charset=utf-8', body: toSrt(transcript.segments) }
        : { contentType: 'text/vtt; charset=utf-8', body: toVtt(transcript.segments) }
    }
  }
}
