import { Navigate, NavLink, Outlet } from 'react-router'
import { useAuth } from '../../store/auth'
import { useTranslation } from '../../i18n'

export function RequireAdmin() {
  const profile = useAuth((s) => s.profile)
  const { t } = useTranslation()
  if (!profile) return <div className="p-6 text-sm text-slate-500">{t('app.loading')}</div>
  return profile.role === 'admin' ? <Outlet /> : <Navigate to="/" replace />
}

export function AdminTabs() {
  const { t } = useTranslation()
  const tabs = [
    { to: '/admin/users', label: t('admin.tabUsers') },
    { to: '/admin/projects', label: t('admin.tabProjects') },
    { to: '/admin/photos', label: t('admin.tabPhotos') },
    { to: '/admin/categories', label: t('admin.tabCategories') },
    { to: '/admin/storage', label: t('admin.tabStorage') },
  ]
  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 py-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-600'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  )
}
