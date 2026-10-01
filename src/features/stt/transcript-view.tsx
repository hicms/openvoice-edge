import { ChevronDown, Copy, Download, Volume2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestamp, type Transcript } from '../../../shared/subtitles.ts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { copyText, downloadText } from '@/lib/browser'
import { canExport, EXPORT_FORMATS, exportTranscript, withEditedSegments } from './transcript-export'

interface TranscriptViewProps {
  transcript: Transcript
  onChange: (transcript: Transcript) => void
  onReadAloud: (text: string) => void
}

export function TranscriptView({ transcript, onChange, onReadAloud }: TranscriptViewProps) {
  const { t } = useTranslation()
  const label = (id: string) => t('transcribe.result.speaker', { id })
  const edited = withEditedSegments(transcript)
  const hasText = edited.text.trim().length > 0

  async function copy() {
    if (await copyText(edited.text)) toast.success(t('common.copied'))
    else toast.error(t('errors.unknown'))
  }

  function setSegmentText(index: number, text: string) {
    onChange({ ...transcript, segments: transcript.segments!.map((s, i) => (i === index ? { ...s, text } : s)) })
  }

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{t('transcribe.result.title')}</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!hasText}>
              <Copy /> {t('transcribe.result.copy')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!hasText}>
                  <Download /> {t('transcribe.result.export')} <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {EXPORT_FORMATS.map((format) => {
                  const enabled = canExport(format, transcript)
                  return (
                    <DropdownMenuItem
                      key={format}
                      disabled={!enabled}
                      onSelect={() => {
                        const file = exportTranscript(transcript, format, label)
                        downloadText(file.content, file.filename, file.mime)
                      }}
                    >
                      {t(`transcribe.result.formats.${format}`)}
                      {!enabled && <span className="ml-auto text-xs text-muted-foreground">{t('transcribe.result.needsTimestamps')}</span>}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => onReadAloud(edited.text)} disabled={!hasText}>
              <Volume2 /> {t('transcribe.result.readAloud')}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {transcript.language && <Badge variant="secondary">{t('transcribe.result.language', { language: transcript.language })}</Badge>}
          {transcript.duration !== undefined && <Badge variant="secondary">{t('transcribe.result.duration', { seconds: transcript.duration.toFixed(1) })}</Badge>}
        </div>
      </CardHeader>
      <CardContent>
        {!hasText ? (
          <p className="text-sm text-muted-foreground">{t('transcribe.result.noText')}</p>
        ) : transcript.segments?.length ? (
          <ol className="flex flex-col gap-3">
            {transcript.segments.map((segment, index) => (
              <li key={index} className="flex flex-col gap-1.5 sm:flex-row sm:gap-3">
                <div className="flex shrink-0 items-center gap-2 sm:w-40 sm:flex-col sm:items-start sm:gap-0.5">
                  {segment.speaker && <span className="text-sm font-medium">{label(segment.speaker)}</span>}
                  <span className="text-xs text-muted-foreground tabular-nums">{formatTimestamp(segment.start, '.').slice(0, 8)}</span>
                </div>
                <Textarea
                  value={segment.text}
                  onChange={(e) => setSegmentText(index, e.target.value)}
                  rows={2}
                  className="min-h-12 flex-1 resize-y"
                  aria-label={`${segment.speaker ? label(segment.speaker) : ''} ${formatTimestamp(segment.start, '.').slice(0, 8)}`.trim()}
                />
              </li>
            ))}
          </ol>
        ) : (
          <Textarea
            value={transcript.text}
            onChange={(e) => onChange({ ...transcript, text: e.target.value })}
            placeholder={t('transcribe.result.placeholder')}
            className="min-h-48 resize-y"
            aria-label={t('transcribe.result.title')}
          />
        )}
      </CardContent>
    </Card>
  )
}
