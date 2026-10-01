import { KeyRound, Trash2 } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AdminConfigView } from '../../../shared/schemas.ts'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/i18n/error-message'
import { apiJson } from '@/lib/api'

interface KeyCardProps {
  status: AdminConfigView['siliconflow']
  onChanged: (view: AdminConfigView) => void
}

export function KeyCard({ status, onChanged }: KeyCardProps) {
  const { t } = useTranslation()
  const inputId = useId()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!value.trim()) return
    setBusy(true)
    try {
      onChanged(await apiJson<AdminConfigView>('/api/admin/config', { method: 'PUT', json: { siliconflowApiKey: value.trim() } }))
      setValue('')
      toast.success(t('admin.key.saved'))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    try {
      onChanged(await apiJson<AdminConfigView>('/api/admin/config/siliconflow-key', { method: 'DELETE' }))
      toast.success(t('admin.key.removed'))
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t('admin.key.title')}
          <Badge variant={status.configured ? 'secondary' : 'outline'}>
            {status.configured ? t(`admin.key.status.${status.source === 'env' ? 'env' : 'kv'}`, { last4: status.last4 }) : t('admin.key.status.none')}
          </Badge>
        </CardTitle>
        <CardDescription>{t('admin.key.desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor={inputId} className="sr-only">
            {t('admin.key.title')}
          </label>
          <Input id={inputId} type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('admin.key.placeholder')} autoComplete="off" spellCheck={false} className="font-mono sm:flex-1" />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !value.trim()}>
              <KeyRound /> {t('admin.key.save')}
            </Button>
            {status.source === 'kv' && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="outline">
                    <Trash2 /> {t('admin.key.remove')}
                  </Button>
                }
                title={t('admin.key.remove')}
                description={t('admin.key.removeConfirm')}
                confirmLabel={t('admin.key.remove')}
                onConfirm={remove}
              />
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
