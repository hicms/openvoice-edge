import { AudioLines, FileAudio, Mic, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import { useAuth } from '@/features/auth/use-auth'
import { cn } from '@/lib/utils'
import { AccountMenu, LanguageMenu, ThemeMenu } from './header-menus'

function useNavItems() {
  const { t } = useTranslation()
  const { role } = useAuth()
  return [
    { to: '/speak', label: t('nav.speak'), icon: Mic },
    { to: '/transcribe', label: t('nav.transcribe'), icon: FileAudio },
    ...(role === 'admin' ? [{ to: '/admin', label: t('nav.admin'), icon: Settings2 }] : []),
  ]
}

export function Brand() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <AudioLines className="size-4" />
      </span>
      <span>{t('app.name')}</span>
    </div>
  )
}

export function AppShell() {
  const items = useNavItems()
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <Brand />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center">
            <LanguageMenu />
            <ThemeMenu />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 md:pb-8">
        <Outlet />
      </main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid border-t bg-background/95 backdrop-blur md:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn('flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium', isActive ? 'text-primary' : 'text-muted-foreground')
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
