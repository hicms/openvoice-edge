import { Loader2, WifiOff } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/features/auth/auth-context'
import { useAuth } from '@/features/auth/use-auth'
import { UnlockPage } from '@/features/auth/unlock-page'
import { ConfigProvider } from '@/features/config/config-context'
import { AppShell } from '@/features/layout/app-shell'
import { TtsPage } from '@/features/tts/tts-page'
import { Button } from '@/components/ui/button'
import { ThemeProvider } from '@/hooks/theme-provider'
import { useTheme } from '@/hooks/use-theme'

const AdminPage = lazy(() => import('@/features/admin/admin-page').then((m) => ({ default: m.AdminPage })))
const SttPage = lazy(() => import('@/features/stt/stt-page').then((m) => ({ default: m.SttPage })))

function Gate() {
  const { t } = useTranslation()
  const { status, role, recheck } = useAuth()

  if (status === 'checking') {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground" role="status">
        <Loader2 className="mr-2 size-4 animate-spin" />
        {t('common.loading')}
      </div>
    )
  }
  if (status === 'unreachable') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center" role="alert">
        <WifiOff className="size-8 text-muted-foreground" />
        <p>{t('errors.network')}</p>
        <Button onClick={recheck}>{t('common.retry')}</Button>
      </div>
    )
  }
  if (status === 'locked') return <UnlockPage />

  return (
    <ConfigProvider>
      <Suspense fallback={null}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/speak" element={<TtsPage />} />
          <Route path="/transcribe" element={<SttPage />} />
          {role === 'admin' && <Route path="/admin" element={<AdminPage />} />}
          <Route path="*" element={<Navigate to="/speak" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </ConfigProvider>
  )
}

function ThemedToaster() {
  const { resolved } = useTheme()
  return <Toaster theme={resolved} position="top-center" />
}

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <TooltipProvider>
          <AuthProvider>
            <Gate />
          </AuthProvider>
          <ThemedToaster />
        </TooltipProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
