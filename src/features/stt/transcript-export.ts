import { toJson, toMarkdown, toPlainText, toSrt, toVtt, type SpeakerLabel, type Transcript } from '../../../shared/subtitles.ts'

export const EXPORT_FORMATS = ['txt', 'md', 'srt', 'vtt', 'json'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

const MIME: Record<ExportFormat, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  json: 'application/json',
}

export function canExport(format: ExportFormat, transcript: Transcript): boolean {
  return (format !== 'srt' && format !== 'vtt') || Boolean(transcript.segments?.length)
}

/** The transcript text is always rebuilt from the (possibly edited) segments so exports match what is on screen. */
export function withEditedSegments(transcript: Transcript): Transcript {
  if (!transcript.segments?.length) return transcript
  return { ...transcript, text: transcript.segments.map((s) => s.text).join('\n') }
}

export function exportTranscript(transcript: Transcript, format: ExportFormat, label: SpeakerLabel) {
  const edited = withEditedSegments(transcript)
  const segments = edited.segments ?? []
  const content = {
    txt: () => toPlainText(edited, label),
    md: () => toMarkdown(edited, label),
    srt: () => toSrt(segments, label),
    vtt: () => toVtt(segments, label),
    json: () => toJson(edited),
  }[format]()
  return { filename: `transcript.${format}`, mime: MIME[format], content }
}
