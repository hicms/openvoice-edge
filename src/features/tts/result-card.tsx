import { Download, Loader2, Volume2, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

export interface SpeechResult {
  url: string
  blob: Blob
  filename: string
}

interface ResultCardProps {
  result: SpeechResult | null
  busy: { done: number; total: number } | null
  onCancel: () => void
  onDownload: () => void
}

export function ResultCard({ result, busy, onCancel, onDownload }: ResultCardProps) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    // Browsers may refuse autoplay; the visible controls cover that case.
    if (result) void audioRef.current?.play().catch(() => {})
  }, [result])

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('speak.result.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3" aria-live="polite">
        {busy ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                {busy.total > 1 ? t('speak.progress', { done: busy.done, total: busy.total }) : t('speak.generating')}
              </span>
              <Button variant="ghost" size="sm" onClick={onCancel}>
                <X /> {t('speak.cancel')}
              </Button>
            </div>
            <Progress value={busy.total > 1 ? (busy.done / busy.total) * 100 : undefined} aria-label={t('speak.generating')} />
          </div>
        ) : result ? (
          <>
            <audio ref={audioRef} controls src={result.url} className="w-full" />
            <div>
              <Button variant="outline" onClick={onDownload}>
                <Download /> {t('speak.result.download')}
              </Button>
            </div>
          </>
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Volume2 className="size-4" /> {t('speak.result.empty')}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
