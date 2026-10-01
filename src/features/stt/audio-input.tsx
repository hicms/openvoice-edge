import { FileAudio, Mic, Square, Trash2, Upload } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { formatBytes, formatClock } from '@/lib/browser'
import { cn } from '@/lib/utils'
import { useRecorder } from './use-recorder'

const AUDIO_EXTENSIONS = /\.(mp3|wav|m4a|flac|aac|ogg|opus|webm|amr|3gp|mp4)$/i

interface AudioInputProps {
  file: File | null
  maxMb: number
  disabled?: boolean
  onChange: (file: File | null) => void
}

export function AudioInput({ file, maxMb, disabled, onChange }: AudioInputProps) {
  const { t } = useTranslation()
  const recorder = useRecorder()
  const [dragging, setDragging] = useState(false)
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])

  useEffect(() => () => (previewUrl ? URL.revokeObjectURL(previewUrl) : undefined), [previewUrl])

  function accept(candidate: File | undefined) {
    if (!candidate) return
    if (!candidate.type.startsWith('audio/') && !candidate.type.startsWith('video/') && !AUDIO_EXTENSIONS.test(candidate.name)) {
      return toast.error(t('transcribe.input.notAudio'))
    }
    if (candidate.size > maxMb * 1024 * 1024) {
      return toast.error(t('transcribe.input.tooBig', { size: formatBytes(candidate.size), max: maxMb }))
    }
    onChange(candidate)
  }

  async function toggleRecording() {
    if (recorder.recording) {
      try {
        accept(await recorder.stop())
      } catch {
        toast.error(t('errors.unknown'))
      }
      return
    }
    try {
      await recorder.start()
    } catch {
      toast.error(t('transcribe.input.micDenied'))
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    if (!disabled) accept(event.dataTransfer.files[0])
  }

  if (file && previewUrl) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border p-4">
        <div className="flex items-center gap-3">
          <FileAudio className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange(null)} disabled={disabled}>
            <Trash2 /> {t('transcribe.input.remove')}
          </Button>
        </div>
        <audio controls src={previewUrl} className="w-full" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
          dragging && 'border-primary bg-primary/5',
          (disabled || recorder.recording) && 'pointer-events-none opacity-60',
        )}
      >
        <input type="file" accept="audio/*,video/webm,video/mp4,.m4a,.flac,.amr,.3gp" className="sr-only" disabled={disabled || recorder.recording} onChange={(e) => { accept(e.target.files?.[0]); e.target.value = '' }} />
        <Upload className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">{t('transcribe.input.dropTitle')}</span>
        <span className="text-xs text-muted-foreground">{t('transcribe.input.dropHint', { max: maxMb })}</span>
      </label>
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t('transcribe.input.or')}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex items-center gap-3">
        <Button variant={recorder.recording ? 'destructive' : 'outline'} onClick={() => void toggleRecording()} disabled={disabled}>
          {recorder.recording ? <Square /> : <Mic />}
          {recorder.recording ? t('transcribe.input.stop') : t('transcribe.input.record')}
        </Button>
        {recorder.recording && (
          <span className="flex items-center gap-2 text-sm tabular-nums" role="status">
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
            {t('transcribe.input.recording', { time: formatClock(recorder.seconds) })}
          </span>
        )}
      </div>
    </div>
  )
}
