import { RotateCcw } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import type { TtsModelInfo } from '../../../shared/models.ts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useVoices } from '@/features/voices/use-voices'
import { VoicePicker } from '@/features/voices/voice-picker'
import type { SpeechParams } from './synthesize'

const DEFAULT_STYLE = '__default'

interface SliderFieldProps {
  label: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

function SliderField({ label, value, display, min, max, step, onChange }: SliderFieldProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label id={id}>{label}</Label>
        <span className="text-sm text-muted-foreground tabular-nums">{display}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v!)} thumbLabel={label} aria-labelledby={id} />
    </div>
  )
}

interface VoiceSettingsProps {
  model: TtsModelInfo
  params: SpeechParams
  onChange: (patch: Partial<SpeechParams>) => void
  onReset: () => void
}

export function VoiceSettings({ model, params, onChange, onReset }: VoiceSettingsProps) {
  const { t } = useTranslation()
  const { voices } = useVoices(model.id)
  const styles = voices.find((v) => v.id === params.voice)?.styles ?? []
  const { capabilities } = model

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('speak.params.title')}</CardTitle>
        <CardAction>
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw /> {t('speak.params.reset')}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label>{t('speak.voice.label')}</Label>
          <VoicePicker model={model.id} value={params.voice} onChange={(voice) => onChange({ voice, style: '' })} />
        </div>

        <SliderField label={t('speak.params.speed')} value={params.speed} display={`${params.speed.toFixed(2)}×`} min={0.5} max={2} step={0.05} onChange={(speed) => onChange({ speed })} />

        {capabilities.pitch && (
          <SliderField label={t('speak.params.pitch')} value={params.pitch} display={`${params.pitch > 0 ? '+' : ''}${params.pitch}%`} min={-50} max={50} step={5} onChange={(pitch) => onChange({ pitch })} />
        )}
        {capabilities.volume && (
          <SliderField label={t('speak.params.volume')} value={params.volume} display={`${params.volume > 0 ? '+' : ''}${params.volume}%`} min={-50} max={50} step={5} onChange={(volume) => onChange({ volume })} />
        )}

        {capabilities.style && styles.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>{t('speak.params.style')}</Label>
            <Select value={params.style || DEFAULT_STYLE} onValueChange={(v) => onChange({ style: v === DEFAULT_STYLE ? '' : v })}>
              <SelectTrigger className="w-full" aria-label={t('speak.params.style')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_STYLE}>{t('speak.params.styleDefault')}</SelectItem>
                {styles.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
