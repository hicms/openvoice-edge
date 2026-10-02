import { Check, CircleAlert, FileAudio, History, Loader2, Mic, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { findSttModel, findTtsModel } from '../../../shared/models.ts'
import { LOG_RETENTION_DAYS, type OperationLog, type OperationLogQuery } from '../../../shared/operation-logs.ts'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { errorMessage } from '@/i18n/error-message'
import { formatBytes } from '@/lib/browser'
import { useOperationLogs } from './use-operation-logs'

export function OperationLogs() {
  const { t } = useTranslation()
  const { kind, status, setKind, setStatus, page, error, loading, refresh, loadMore, retry } = useOperationLogs()
  const filtered = Boolean(kind || status)

  return (
    <section className="flex flex-col gap-4" aria-label={t('admin.logs.title')}>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={kind ?? 'all'} onValueChange={(value) => setKind(value === 'all' ? undefined : value as OperationLogQuery['kind'])}>
          <SelectTrigger className="w-32" aria-label={t('admin.logs.kindLabel')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.logs.allKinds')}</SelectItem>
            <SelectItem value="speech">{t('nav.speak')}</SelectItem>
            <SelectItem value="transcription">{t('nav.transcribe')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status ?? 'all'} onValueChange={(value) => setStatus(value === 'all' ? undefined : value as OperationLogQuery['status'])}>
          <SelectTrigger className="w-32" aria-label={t('admin.logs.statusLabel')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('admin.logs.allStatuses')}</SelectItem>
            <SelectItem value="success">{t('admin.logs.success')}</SelectItem>
            <SelectItem value="failed">{t('admin.logs.failed')}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="ml-auto" onClick={refresh} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} /> {t('admin.logs.refresh')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border" aria-busy={loading}>
        {page && page.logs.length > 0 ? (
          <ol className="divide-y" aria-label={t('admin.logs.title')}>
            {page.logs.map((log) => <LogRow key={log.id} log={log} />)}
          </ol>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-14 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> {t('common.loading')}
          </div>
        ) : !error && (
          <div className="flex flex-col items-center gap-2 px-4 py-14 text-center" role="status">
            <History className="mb-1 size-6 text-muted-foreground" />
            <p className="text-sm font-medium">{t(page?.cursor ? 'admin.logs.noMatchesYet' : filtered ? 'admin.logs.noMatches' : 'admin.logs.empty')}</p>
            <p className="text-xs text-muted-foreground">{t(page?.cursor ? 'admin.logs.continueHint' : filtered ? 'admin.logs.filterHint' : 'admin.logs.emptyHint')}</p>
          </div>
        )}

        {Boolean(error) && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4" role="alert">
            <p className="text-sm text-destructive">{errorMessage(error)}</p>
            <Button variant="outline" size="sm" onClick={retry} disabled={loading}>{t('common.retry')}</Button>
          </div>
        )}

        {page?.cursor && !error && (
          <div className="flex justify-center border-t px-4 py-3">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {t(page.logs.length ? 'admin.logs.loadMore' : 'admin.logs.continueSearch')}
            </Button>
          </div>
        )}
      </div>
      <div className="space-y-1 text-xs leading-relaxed text-muted-foreground">
        <p>{t('admin.logs.retention', { days: LOG_RETENTION_DAYS })}</p>
        <p>{t('admin.logs.scope')}</p>
      </div>
    </section>
  )
}

function LogRow({ log }: { log: OperationLog }) {
  const { t, i18n } = useTranslation()
  const Icon = log.kind === 'speech' ? Mic : FileAudio
  const failed = log.status === 'failed'
  const model = log.model ? (findTtsModel(log.model)?.label ?? findSttModel(log.model)?.label) : undefined
  const actor = log.actor.id === 'admin' ? t('auth.roleAdmin') : log.actor.label ?? log.actor.id
  const date = new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const errorCode = log.errorCode
  const reason = errorCode === 'invalid_request' ? t('admin.logs.invalidInput')
    : errorCode === 'text_too_long' ? t('admin.logs.textTooLong')
      : errorCode ? t(`errors.${errorCode}`) : ''

  return (
    <li className="flex gap-3 px-4 py-4">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Icon className="size-4" /></span>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium">{t(log.kind === 'speech' ? 'nav.speak' : 'nav.transcribe')}</span>
            {model && <span className="text-xs text-muted-foreground">{model}</span>}
          </div>
          <span className={`flex items-center gap-1 text-xs ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>
            {failed ? <CircleAlert className="size-3.5" /> : <Check className="size-3.5" />}
            {t(failed ? 'admin.logs.failed' : 'admin.logs.success')}
          </span>
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <time dateTime={log.createdAt} title={new Date(log.createdAt).toLocaleString(i18n.language)} className="tabular-nums">{date.format(new Date(log.createdAt))}</time>
          <span className="max-w-full break-words" title={log.actor.id}>{actor}{log.actor.id !== 'admin' && <span className="ml-1 font-mono opacity-70">· {log.actor.id.slice(-6)}</span>}</span>
          {log.inputChars !== undefined && <span>{t('admin.logs.characters', { count: log.inputChars })}</span>}
          {log.audioBytes !== undefined && <span>{formatBytes(log.audioBytes)}</span>}
          <span>{t('admin.logs.duration', { seconds: (log.durationMs / 1000).toFixed(1) })}</span>
        </div>
        {failed && reason && (
          <p className="text-xs leading-relaxed text-destructive" title={errorCode}>{reason}</p>
        )}
      </div>
    </li>
  )
}
