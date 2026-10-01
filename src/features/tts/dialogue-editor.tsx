import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { SpeakerId, Turn } from './dialogue'

const MAX_TURNS = 40

interface DialogueEditorProps {
  turns: Turn[]
  onChange: (turns: Turn[]) => void
}

export function DialogueEditor({ turns, onChange }: DialogueEditorProps) {
  const { t } = useTranslation()
  const update = (index: number, patch: Partial<Turn>) => onChange(turns.map((turn, i) => (i === index ? { ...turn, ...patch } : turn)))
  const nextSpeaker: SpeakerId = turns.at(-1)?.speaker === 1 ? 2 : 1

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t('speak.dialogue.hint')}</p>
      <ul className="flex flex-col gap-3">
        {turns.map((turn, index) => (
          <li key={index} className="flex items-start gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={String(turn.speaker)}
              onValueChange={(v) => v && update(index, { speaker: v === '2' ? 2 : 1 })}
              aria-label={t('speak.dialogue.speaker', { n: turn.speaker })}
              className="shrink-0"
            >
              <ToggleGroupItem value="1" className={cn(turn.speaker === 1 && 'text-primary')}>
                S1
              </ToggleGroupItem>
              <ToggleGroupItem value="2" className={cn(turn.speaker === 2 && 'text-primary')}>
                S2
              </ToggleGroupItem>
            </ToggleGroup>
            <Textarea
              value={turn.text}
              onChange={(e) => update(index, { text: e.target.value })}
              placeholder={t('speak.dialogue.placeholder')}
              aria-label={t('speak.dialogue.speaker', { n: turn.speaker })}
              rows={2}
              className="min-h-14 flex-1 resize-y"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onChange(turns.filter((_, i) => i !== index))}
              disabled={turns.length <= 1}
              aria-label={t('speak.dialogue.remove')}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button variant="outline" size="sm" onClick={() => onChange([...turns, { speaker: nextSpeaker, text: '' }])} disabled={turns.length >= MAX_TURNS}>
          <Plus /> {t('speak.dialogue.add')}
        </Button>
      </div>
    </div>
  )
}
