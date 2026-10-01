import { Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Brand } from '@/features/layout/app-shell'
import { LanguageMenu, ThemeMenu } from '@/features/layout/header-menus'
import { errorMessage } from '@/i18n/error-message'
import { ApiError } from '@/lib/api'
import { useAuth } from './use-auth'

export function UnlockPage() {
  const { t } = useTranslation()
  const { signIn } = useAuth()
  const inputId = useId()
  const errorId = useId()
  const [token, setToken] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!token.trim()) return
    setBusy(true)
    setError(null)
    try {
      await signIn(token.trim())
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'unauthorized' ? t('auth.invalid') : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center justify-between px-4">
        <Brand />
        <div className="flex">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-secondary">
              <LockKeyhole className="size-5" />
            </div>
            <CardTitle className="text-lg">{t('auth.title')}</CardTitle>
            <CardDescription>{t('auth.subtitle')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={inputId}>{t('auth.label')}</Label>
                <div className="relative">
                  <Input
                    id={inputId}
                    type={visible ? 'text' : 'password'}
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder={t('auth.placeholder')}
                    autoComplete="off"
                    autoFocus
                    spellCheck={false}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="pr-10 font-mono"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="absolute top-1/2 right-1 -translate-y-1/2"
                    onClick={() => setVisible((v) => !v)}
                    aria-label={visible ? t('common.hide') : t('common.show')}
                  >
                    {visible ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
                {error && (
                  <p id={errorId} role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
              <Button type="submit" size="lg" disabled={busy || !token.trim()}>
                {busy && <Loader2 className="animate-spin" />}
                {busy ? t('auth.checking') : t('auth.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
