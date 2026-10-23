import { useEffect } from 'react'
import { Link, Navigate, Outlet } from 'react-router'
import { useAuth } from '../store/auth'
import { useTranslation } from '../i18n'
import { LanguageToggle } from '../components/LanguageToggle'
import { SyncBanner } from '../components/SyncBanner'

function Shell() {
  const { user, profile, logout, loadProfile } = useAuth()
  const { t } = useTranslation()

  // Cek berkala apakah user dinonaktifkan admin / role berubah.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (navigator.onLine) void loadProfile()
    }, 60000)
    return () => window.clearInterval(id)
  }, [loadProfile])

  return (
    <div className="flex min-h-full flex-col">
      <SyncBanner />
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <Link to="/" className="text-lg font-bold text-slate-900">
          {t('app.name')}
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {profile?.role === 'admin' && (
            <Link to="/admin" className="text-sm font-medium text-slate-700 underline">
              {t('app.admin')}
            </Link>
          )}
          <span className="hidden text-sm text-slate-500 sm:inline">{user?.email}</span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700"
          >
            {t('app.logout')}
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export function RequireAuth() {
  const { user, initializing } = useAuth()
  const { t } = useTranslation()
  if (initializing)
    return <div className="flex min-h-full items-center justify-center p-6 text-gray-500">{t('app.loading')}</div>
  return user ? <Shell /> : <Navigate to="/login" replace />
}
