import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Gender, VoiceInfo } from '../../../shared/models.ts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { errorMessage } from '@/i18n/error-message'
import { cn } from '@/lib/utils'
import { useVoices } from './use-voices'

const ALL = 'all'

function localeLabel(locale: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'language' }).of(locale) ?? locale
  } catch {
    return locale
  }
}

/** Chinese and English first because those are the app's two UI languages; the rest alphabetical. */
function compareLocales(a: string, b: string): number {
  const rank = (l: string) => (l === 'zh-CN' ? 0 : l.startsWith('zh') ? 1 : l === 'en-US' ? 2 : l.startsWith('en') ? 3 : 4)
  return rank(a) - rank(b) || a.localeCompare(b)
}

interface VoicePickerProps {
  model: string
  value: string
  onChange: (voiceId: string) => void
  /** Prefix for ids when several pickers are on one page. */
  label?: string
}

export function VoicePicker({ model, value, onChange, label }: VoicePickerProps) {
  const { t, i18n } = useTranslation()
  const { voices, loading, error } = useVoices(model)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [locale, setLocale] = useState<string>(ALL)
  const [gender, setGender] = useState<Gender | typeof ALL>(ALL)
  const searchId = useId()

  const current = voices.find((v) => v.id === value)
  const locales = useMemo(() => [...new Set(voices.map((v) => v.locale))].sort(compareLocales), [voices])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return voices.filter((v) => {
      if (locale !== ALL && v.locale !== locale) return false
      if (gender !== ALL && v.gender !== gender) return false
      if (!q) return true
      return `${v.name} ${v.id} ${localeLabel(v.locale, i18n.language)}`.toLowerCase().includes(q)
    })
  }, [voices, query, locale, gender, i18n.language])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setQuery('')
      setGender(ALL)
      setLocale(current?.locale ?? ALL)
    }
  }

  const summary = current ? current.name : value

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-10 w-full justify-between" aria-label={label ?? t('speak.voice.choose')} disabled={loading && !current}>
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{summary}</span>
            {current && <span className="truncate text-xs text-muted-foreground">{localeLabel(current.locale, i18n.language)}</span>}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85svh] flex-col gap-3 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('speak.voice.choose')}</DialogTitle>
          <DialogDescription>{loading ? t('speak.voice.loading') : t('speak.voice.count', { count: filtered.length })}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input id={searchId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('speak.voice.search')} aria-label={t('speak.voice.search')} className="pl-8" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={locale} onValueChange={setLocale}>
            <SelectTrigger className="w-48" aria-label={t('speak.voice.language')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('speak.voice.allLanguages')}</SelectItem>
              {locales.map((l) => (
                <SelectItem key={l} value={l}>
                  {localeLabel(l, i18n.language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ToggleGroup type="single" variant="outline" value={gender} onValueChange={(v) => setGender((v || ALL) as Gender | typeof ALL)} aria-label={t('speak.voice.gender')}>
            <ToggleGroupItem value={ALL}>{t('common.all')}</ToggleGroupItem>
            <ToggleGroupItem value="female">{t('common.female')}</ToggleGroupItem>
            <ToggleGroupItem value="male">{t('common.male')}</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(error)}
          </p>
        ) : (
          <ScrollArea className="-mx-1 h-[45svh] min-h-0 flex-1 px-1">
            {filtered.length === 0 && !loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('speak.voice.none')}</p>
            ) : (
              <ul className="flex flex-col gap-1" aria-label={t('speak.voice.label')}>
                {filtered.map((v) => (
                  <VoiceRow
                    key={v.id}
                    voice={v}
                    selected={v.id === value}
                    language={localeLabel(v.locale, i18n.language)}
                    onSelect={() => {
                      onChange(v.id)
                      setOpen(false)
                    }}
                  />
                ))}
              </ul>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}

function VoiceRow({ voice, selected, language, onSelect }: { voice: VoiceInfo; selected: boolean; language: string; onSelect: () => void }) {
  const { t } = useTranslation()
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
          selected && 'bg-secondary',
        )}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{voice.name}</span>
          <span className="truncate text-xs text-muted-foreground">{language}</span>
        </span>
        <Badge variant="outline">{voice.gender === 'female' ? t('common.female') : t('common.male')}</Badge>
        <Check className={cn('size-4 text-primary', !selected && 'invisible')} />
      </button>
    </li>
  )
}
