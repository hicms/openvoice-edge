import { Check, Copy, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { AccessKeyView, CreatedAccessKey } from '../../../shared/schemas.ts'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/i18n/error-message'
import { apiJson } from '@/lib/api'
import { copyText } from '@/lib/browser'

export function AccessKeysCard() {
  const { t, i18n } = useTranslation()
  const labelId = useId()
  const [keys, setKeys] = useState<AccessKeyView[] | null>(null)
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<CreatedAccessKey | null>(null)
  const [copied, setCopied] = useState(false)

  const [version, setVersion] = useState(0)
  const refresh = () => setVersion((v) => v + 1)

  useEffect(() => {
    let active = true
    apiJson<{ keys: AccessKeyView[] }>('/api/admin/keys').then(
      (body) => active && setKeys(body.keys),
      (err: unknown) => active && toast.error(errorMessage(err)),
    )
    return () => {
      active = false
    }
  }, [version])

  async function create(event: FormEvent) {
    event.preventDefault()
    if (!label.trim()) return
    setBusy(true)
    try {
      setCreated(await apiJson<CreatedAccessKey>('/api/admin/keys', { method: 'POST', json: { label: label.trim() } }))
      setLabel('')
      setCopied(false)
      refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string) {
    try {
      await apiJson(`/api/admin/keys/${id}`, { method: 'DELETE' })
      toast.success(t('admin.keys.revoked'))
      refresh()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  async function copyNewKey() {
    if (created && (await copyText(created.key))) {
      setCopied(true)
      toast.success(t('common.copied'))
    }
  }

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('admin.keys.title')}</CardTitle>
        <CardDescription>{t('admin.keys.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row">
          <label htmlFor={labelId} className="sr-only">
            {t('admin.keys.label')}
          </label>
          <Input id={labelId} value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} placeholder={t('admin.keys.labelPlaceholder')} className="sm:flex-1" />
          <Button type="submit" disabled={busy || !label.trim()}>
            <Plus /> {t('admin.keys.create')}
          </Button>
        </form>

        {keys?.length === 0 && <p className="text-sm text-muted-foreground">{t('admin.keys.empty')}</p>}
        {keys && keys.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {keys.map((key) => (
              <li key={key.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{key.label}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">ovk_{key.id}_…</span> · {t('admin.keys.created', { date: dateFormat.format(new Date(key.createdAt)) })}
                  </p>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm" aria-label={`${t('admin.keys.revoke')} ${key.label}`}>
                      <Trash2 /> {t('admin.keys.revoke')}
                    </Button>
                  }
                  title={t('admin.keys.revokeConfirmTitle')}
                  description={t('admin.keys.revokeConfirmBody')}
                  confirmLabel={t('admin.keys.revoke')}
                  onConfirm={() => revoke(key.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={created !== null} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.keys.newTitle')}</DialogTitle>
            <DialogDescription>{t('admin.keys.newBody')}</DialogDescription>
          </DialogHeader>
          <code className="rounded-lg border bg-muted px-3 py-2 font-mono text-sm break-all select-all">{created?.key}</code>
          <DialogFooter>
            <Button variant="outline" onClick={() => void copyNewKey()}>
              {copied ? <Check /> : <Copy />} {t('common.copy')}
            </Button>
            <Button onClick={() => setCreated(null)}>{t('admin.keys.done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
