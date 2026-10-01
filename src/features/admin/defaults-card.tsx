import { Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { STT_MODELS, TTS_MODELS } from '../../../shared/models.ts'
import { HARD_MAX_AUDIO_MB, HARD_MAX_TTS_CHARS, type AdminConfigView, type AppSettings } from '../../../shared/schemas.ts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { engineKey } from '@/features/tts/engines'
import { VoicePicker } from '@/features/voices/voice-picker'
import { errorMessage } from '@/i18n/error-message'
import { apiJson } from '@/lib/api'

interface DefaultsCardProps {
  settings: AppSettings
  onChanged: (view: AdminConfigView) => void
}

export function DefaultsCard({ settings, onChanged }: DefaultsCardProps) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(settings)
  const [busy, setBusy] = useState(false)
  const engineName = (id: string) => t(`speak.engines.${engineKey(id)}.name`)

  const validLimits =
    Number.isInteger(draft.maxTtsChars) && draft.maxTtsChars >= 100 && draft.maxTtsChars <= HARD_MAX_TTS_CHARS &&
    Number.isInteger(draft.maxAudioMb) && draft.maxAudioMb >= 1 && draft.maxAudioMb <= HARD_MAX_AUDIO_MB

  async function save() {
    setBusy(true)
    try {
      onChanged(await apiJson<AdminConfigView>('/api/admin/config', { method: 'PUT', json: draft }))
      toast.success(t('admin.defaults.saved'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.defaults.title')}</CardTitle>
        <CardDescription>{t('admin.defaults.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label>{t('admin.defaults.ttsModel')}</Label>
          <Select value={draft.defaultTtsModel} onValueChange={(v) => setDraft((d) => ({ ...d, defaultTtsModel: v }))}>
            <SelectTrigger className="w-full" aria-label={t('admin.defaults.ttsModel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TTS_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {engineName(m.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label>{t('admin.defaults.sttModel')}</Label>
          <Select value={draft.defaultSttModel} onValueChange={(v) => setDraft((d) => ({ ...d, defaultSttModel: v }))}>
            <SelectTrigger className="w-full" aria-label={t('admin.defaults.sttModel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STT_MODELS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {t(`transcribe.scenarios.${m.scenario}.name`)} · {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <fieldset className="flex flex-col gap-3 sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">{t('admin.defaults.voices')}</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            {TTS_MODELS.map((m) => (
              <div key={m.id} className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">{engineName(m.id)}</span>
                <VoicePicker
                  model={m.id}
                  label={`${t('admin.defaults.voices')} · ${engineName(m.id)}`}
                  value={draft.defaultVoices[m.id] ?? ''}
                  onChange={(voice) => setDraft((d) => ({ ...d, defaultVoices: { ...d.defaultVoices, [m.id]: voice } }))}
                />
              </div>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <Label htmlFor="max-chars">{t('admin.defaults.maxTtsChars')}</Label>
          <Input id="max-chars" type="number" inputMode="numeric" min={100} max={HARD_MAX_TTS_CHARS} step={100} value={draft.maxTtsChars} onChange={(e) => setDraft((d) => ({ ...d, maxTtsChars: e.target.valueAsNumber }))} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="max-mb">{t('admin.defaults.maxAudioMb')}</Label>
          <Input id="max-mb" type="number" inputMode="numeric" min={1} max={HARD_MAX_AUDIO_MB} value={draft.maxAudioMb} onChange={(e) => setDraft((d) => ({ ...d, maxAudioMb: e.target.valueAsNumber }))} />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t('admin.defaults.limitsHint')}</p>
      </CardContent>
      <CardFooter>
        <Button onClick={() => void save()} disabled={busy || !validLimits}>
          <Save /> {t('admin.defaults.save')}
        </Button>
      </CardFooter>
    </Card>
  )
}
