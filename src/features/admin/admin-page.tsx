import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import type { AdminConfigView } from '../../../shared/schemas.ts'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConfig } from '@/features/config/use-config'
import { PageLoading } from '@/features/tts/tts-page'
import { errorMessage } from '@/i18n/error-message'
import { apiJson } from '@/lib/api'
import { AccessKeysCard } from './access-keys-card'
import { DefaultsCard } from './defaults-card'
import { KeyCard } from './key-card'
import { OperationLogs } from './operation-logs'

export function AdminPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'logs' ? 'logs' : 'settings'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{t('admin.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('admin.subtitle')}</p>
      </div>
      <Tabs value={tab} onValueChange={(next) => setParams((current) => {
        const updated = new URLSearchParams(current)
        if (next === 'logs') updated.set('tab', 'logs')
        else updated.delete('tab')
        return updated
      })} className="gap-5">
        <TabsList aria-label={t('admin.title')}>
          <TabsTrigger value="settings" className="px-4">{t('admin.settings')}</TabsTrigger>
          <TabsTrigger value="logs" className="px-4">{t('admin.logs.title')}</TabsTrigger>
        </TabsList>
        <TabsContent value="settings" forceMount className={tab === 'settings' ? undefined : 'hidden'}><AdminSettings /></TabsContent>
        <TabsContent value="logs"><OperationLogs /></TabsContent>
      </Tabs>
    </div>
  )
}

function AdminSettings() {
  const { reload } = useConfig()
  const [view, setView] = useState<AdminConfigView | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    apiJson<AdminConfigView>('/api/admin/config').then(setView, setError)
  }, [])

  // The Speak and Transcribe pages read the public config, so it must follow every admin change.
  const onChanged = useCallback(
    (next: AdminConfigView) => {
      setView(next)
      void reload()
    },
    [reload],
  )

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : !view ? (
        <PageLoading />
      ) : (
        <>
          <KeyCard status={view.siliconflow} onChanged={onChanged} />
          {/* Remounts with fresh values whenever the saved settings change. */}
          <DefaultsCard key={JSON.stringify(view.settings)} settings={view.settings} onChanged={onChanged} />
          <AccessKeysCard />
        </>
      )}
    </div>
  )
}
