import { Clock, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { SttModelInfo } from '../../../shared/models.ts'
import { Badge } from '@/components/ui/badge'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

interface ScenarioPickerProps {
  models: SttModelInfo[]
  value: string
  onChange: (modelId: string) => void
  disabled?: boolean
}

export function ScenarioPicker({ models, value, onChange, disabled }: ScenarioPickerProps) {
  const { t } = useTranslation()
  return (
    <RadioGroup value={value} onValueChange={onChange} disabled={disabled} className="grid gap-3 sm:grid-cols-3" aria-label={t('transcribe.title')}>
      {models.map((model) => {
        const id = `scenario-${model.scenario}`
        return (
          <label
            key={model.id}
            htmlFor={id}
            className={cn(
              'flex cursor-pointer flex-col gap-2 rounded-xl border p-4 transition-colors hover:bg-muted/50 has-focus-visible:ring-3 has-focus-visible:ring-ring/50',
              value === model.id && 'border-primary bg-primary/5',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <span className="flex items-center gap-2">
              <RadioGroupItem id={id} value={model.id} />
              <span className="font-medium">{t(`transcribe.scenarios.${model.scenario}.name`)}</span>
            </span>
            <span className="text-sm text-muted-foreground">{t(`transcribe.scenarios.${model.scenario}.desc`)}</span>
            <span className="mt-auto flex flex-wrap gap-1.5">
              <Badge variant="secondary">{model.label}</Badge>
              {model.timestamps && (
                <Badge variant="outline">
                  <Clock /> {t('transcribe.badges.timestamps')}
                </Badge>
              )}
              {model.speakers && (
                <Badge variant="outline">
                  <Users /> {t('transcribe.badges.speakers')}
                </Badge>
              )}
            </span>
          </label>
        )
      })}
    </RadioGroup>
  )
}
