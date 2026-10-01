import { AlertCircle, Loader2, ScrollText, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { PublicConfig } from '../../../shared/schemas.ts'
import type { Transcript } from '../../../shared/subtitles.ts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useConfig } from '@/features/config/use-config'
import { PageError, PageLoading } from '@/features/tts/tts-page'
import { errorMessage } from '@/i18n/error-message'
import { ApiError, request } from '@/lib/api'
import { AudioInput } from './audio-input'
import { ScenarioPicker } from './scenario-picker'
import { TranscriptView } from './transcript-view'

export function SttPage() {
  const { config, error, reload } = useConfig()
  if (config) return <SttWorkspace config={config} />
  return error ? <PageError error={error} onRetry={reload} /> : <PageLoading />
}

async function transcribe(file: File, model: string, signal: AbortSignal): Promise<Transcript> {
  const form = new FormData()
  form.append('file', file, file.name)
  form.append('model', model)
  form.append('response_format', 'verbose_json')
  const res = await request('/v1/audio/transcriptions', { method: 'POST', form, signal })
  return (await res.json()) as Transcript
}

function SttWorkspace({ config }: { config: PublicConfig }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [modelId, setModelId] = useState(config.defaults.defaultSttModel)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [transcript, setTranscript] = useState<Transcript | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  if (config.sttModels.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold tracking-tight">{t('transcribe.title')}</h1>
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
            <AlertCircle className="size-5 shrink-0" />
            {t('transcribe.unavailable')}
          </CardContent>
        </Card>
      </div>
    )
  }

  async function run() {
    if (!file) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    try {
      setTranscript(await transcribe(file, modelId, controller.signal))
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'aborted')) toast.error(errorMessage(err))
    } finally {
      abortRef.current = null
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <h1 className="text-xl font-semibold tracking-tight">{t('transcribe.title')}</h1>

      <ScenarioPicker models={config.sttModels} value={modelId} onChange={setModelId} disabled={busy} />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <AudioInput file={file} maxMb={config.limits.maxAudioMb} disabled={busy} onChange={setFile} />
          {busy ? (
            <div className="flex flex-col gap-3" role="status">
              <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> {t('transcribe.running')}
                </span>
                <Button variant="ghost" size="sm" onClick={() => abortRef.current?.abort()}>
                  <X /> {t('transcribe.cancel')}
                </Button>
              </div>
              <Progress aria-label={t('transcribe.running')} />
            </div>
          ) : (
            <div>
              <Button size="lg" onClick={() => void run()} disabled={!file}>
                <ScrollText /> {t('transcribe.run')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {transcript && <TranscriptView transcript={transcript} onChange={setTranscript} onReadAloud={(text) => navigate('/speak', { state: { text } })} />}
    </div>
  )
}
