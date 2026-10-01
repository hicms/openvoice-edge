import { FileText, Loader2, Sparkles, Trash } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router'
import { toast } from 'sonner'
import type { PublicConfig } from '../../../shared/schemas.ts'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useConfig } from '@/features/config/use-config'
import { errorMessage } from '@/i18n/error-message'
import { ApiError } from '@/lib/api'
import { downloadBlob, filenameFromText } from '@/lib/browser'
import { emptyDialogue, scriptToTurns, turnsToScript, type Turn } from './dialogue'
import { DialogueEditor } from './dialogue-editor'
import { engineKey } from './engines'
import { addHistory, loadHistory, saveHistory, type HistoryItem } from './history'
import { HistorySheet } from './history-sheet'
import { loadPrefs, savePrefs, DEFAULT_PREFS } from './prefs'
import { ResultCard, type SpeechResult } from './result-card'
import { synthesize, type SpeechParams } from './synthesize'
import { VoiceSettings } from './voice-settings'

const INSTRUCTION_PRESETS = ['happy', 'sad', 'gentle', 'excited', 'sichuan', 'cantonese'] as const
const MAX_IMPORT_BYTES = 1024 * 1024

export function TtsPage() {
  const { config, error, reload } = useConfig()
  if (config) return <TtsWorkspace config={config} />
  return error ? <PageError error={error} onRetry={reload} /> : <PageLoading />
}

export function PageError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-start gap-3 py-12" role="alert">
      <p className="text-sm text-destructive">{errorMessage(error)}</p>
      <Button variant="outline" onClick={onRetry}>
        {t('common.retry')}
      </Button>
    </div>
  )
}

export function PageLoading() {
  const { t } = useTranslation()
  return (
    <p className="flex items-center gap-2 py-12 text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" /> {t('common.loading')}
    </p>
  )
}

function TtsWorkspace({ config }: { config: PublicConfig }) {
  const { t } = useTranslation()
  const location = useLocation()
  const incomingText = (location.state as { text?: string } | null)?.text

  const [prefs] = useState(loadPrefs)
  const [modelId, setModelId] = useState(() => (config.ttsModels.some((m) => m.id === prefs.model) ? prefs.model! : config.defaults.defaultTtsModel))
  const [voices, setVoices] = useState(prefs.voices)
  const [tuning, setTuning] = useState({ speed: prefs.speed, pitch: prefs.pitch, volume: prefs.volume, style: prefs.style, instructions: prefs.instructions })
  const [text, setText] = useState(incomingText ?? '')
  const [turns, setTurns] = useState<Turn[]>(emptyDialogue)
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<SpeechResult | null>(null)
  const [history, setHistory] = useState(loadHistory)
  const [historyOpen, setHistoryOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const model = config.ttsModels.find((m) => m.id === modelId) ?? config.ttsModels[0]!
  const voice = voices[model.id] ?? config.defaults.defaultVoices[model.id] ?? ''
  const params: SpeechParams = { voice, ...tuning }
  const dialogue = model.capabilities.dialogue
  const input = dialogue ? turnsToScript(turns) : text.trim()
  const max = config.limits.maxTtsChars
  const overLimit = input.length > max

  useEffect(() => {
    savePrefs({ model: model.id, voices, ...tuning })
  }, [model.id, voices, tuning])

  useEffect(() => () => abortRef.current?.abort(), [])
  useEffect(() => saveHistory(history), [history])
  useEffect(() => {
    if (!result) return
    return () => URL.revokeObjectURL(result.url)
  }, [result])

  const engineName = useCallback((id: string) => t(`speak.engines.${engineKey(id)}.name`), [t])

  function switchModel(next: string) {
    const target = config.ttsModels.find((m) => m.id === next)
    if (target?.capabilities.dialogue && !turnsToScript(turns) && text.trim()) setTurns([{ speaker: 1, text: text.trim() }, { speaker: 2, text: '' }])
    setModelId(next)
  }

  async function generate() {
    if (!input) return toast.error(t('speak.emptyText'))
    const controller = new AbortController()
    abortRef.current = controller
    setBusy({ done: 0, total: 1 })
    try {
      const blob = await synthesize({
        model,
        text: input,
        params,
        signal: controller.signal,
        onProgress: (done, total) => setBusy({ done, total }),
      })
      setResult({ url: URL.createObjectURL(blob), blob, filename: filenameFromText(input.replace(/\[S\d\]/g, ' '), 'mp3') })
      setHistory((items) => addHistory(items, { model: model.id, text: input, params }))
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'aborted')) toast.error(errorMessage(err))
    } finally {
      abortRef.current = null
      setBusy(null)
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('too large')
      setText(await file.text())
    } catch {
      toast.error(t('speak.text.importFailed'))
    }
  }

  function restore(item: HistoryItem) {
    const target = config.ttsModels.find((m) => m.id === item.model)
    if (!target) return
    const { voice: itemVoice, ...itemTuning } = item.params
    setModelId(target.id)
    setVoices((v) => ({ ...v, [target.id]: itemVoice }))
    setTuning(itemTuning)
    if (target.capabilities.dialogue) setTurns(scriptToTurns(item.text))
    else setText(item.text)
    setHistoryOpen(false)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">{t('speak.title')}</h1>
        <HistorySheet
          items={history}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onRestore={restore}
          onClear={() => {
            setHistory([])
            toast.success(t('speak.history.cleared'))
          }}
          engineName={engineName}
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Tabs value={model.id} onValueChange={switchModel}>
              <TabsList className="h-auto w-full flex-wrap justify-start sm:w-fit">
                {config.ttsModels.map((m) => (
                  <TabsTrigger key={m.id} value={m.id} className="px-4">
                    {engineName(m.id)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <p className="text-sm text-muted-foreground">{t(`speak.engines.${engineKey(model.id)}.desc`)}</p>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-4">
              {model.capabilities.instruction && (
                <InstructionField value={tuning.instructions} onChange={(instructions) => setTuning((v) => ({ ...v, instructions }))} />
              )}

              {dialogue ? (
                <DialogueEditor turns={turns} onChange={setTurns} />
              ) : (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="tts-text">{t('speak.text.label')}</Label>
                  <Textarea
                    id="tts-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t('speak.text.placeholder')}
                    className="max-h-[40svh] min-h-40 resize-y"
                    aria-invalid={overLimit || undefined}
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <span className={overLimit ? 'text-sm text-destructive tabular-nums' : 'text-sm text-muted-foreground tabular-nums'} aria-live="polite">
                    {t('speak.text.counter', { count: input.length, max })}
                  </span>
                  {!dialogue && (
                    <>
                      <input ref={fileRef} type="file" accept=".txt,text/plain" className="sr-only" tabIndex={-1} onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = '' }} />
                      <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                        <FileText /> {t('speak.text.import')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setText('')} disabled={!text}>
                        <Trash /> {t('common.clear')}
                      </Button>
                    </>
                  )}
                </div>
                <Button size="lg" onClick={() => void generate()} disabled={busy !== null || !input || overLimit} className="min-w-36">
                  {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                  {busy ? t('speak.generating') : t('speak.generate')}
                </Button>
              </div>
              {overLimit && (
                <p role="alert" className="text-sm text-destructive">
                  {t('speak.text.tooLong', { max })}
                </p>
              )}
            </CardContent>
          </Card>

          <ResultCard
            result={result}
            busy={busy}
            onCancel={() => abortRef.current?.abort()}
            onDownload={() => result && downloadBlob(result.blob, result.filename)}
          />
        </div>

        <aside>
          <VoiceSettings
            model={model}
            params={params}
            onChange={({ voice: nextVoice, ...rest }) => {
              if (nextVoice !== undefined) setVoices((v) => ({ ...v, [model.id]: nextVoice }))
              if (Object.keys(rest).length) setTuning((v) => ({ ...v, ...rest }))
            }}
            onReset={() => {
              const { model: _model, voices: _voices, ...defaults } = DEFAULT_PREFS
              setTuning((v) => ({ ...defaults, instructions: v.instructions }))
              setVoices((v) => ({ ...v, [model.id]: config.defaults.defaultVoices[model.id] ?? '' }))
            }}
          />
        </aside>
      </div>
    </div>
  )
}

function InstructionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="tts-instruction">
        {t('speak.instruction.label')} <span className="font-normal text-muted-foreground">({t('common.optional')})</span>
      </Label>
      <Input id="tts-instruction" value={value} maxLength={200} onChange={(e) => onChange(e.target.value)} placeholder={t('speak.instruction.placeholder')} />
      <div className="flex flex-wrap gap-1.5">
        {INSTRUCTION_PRESETS.map((key) => (
          <Button key={key} variant="outline" size="xs" onClick={() => onChange(t(`speak.instruction.presetPrompts.${key}`))}>
            {t(`speak.instruction.presets.${key}`)}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('speak.instruction.hint')}</p>
    </div>
  )
}
