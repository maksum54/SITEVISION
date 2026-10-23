import { useAdminUsers } from '../../hooks/data'
import { useAuth } from '../../store/auth'
import { useTranslation } from '../../i18n'

export function AdminUsersPage() {
  const { users, loading, setUserRole, deleteUser } = useAdminUsers()
  const me = useAuth((s) => s.user)
  const { t } = useTranslation()
  if (loading) return <p className="p-4 text-sm text-slate-500">{t('app.loading')}</p>

  const run = (fn: () => Promise<void>) =>
    fn().catch((e: Error) => window.alert(t('error.generic', { error: e.message })))

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold text-slate-900">{t('adminUsers.title', { count: users.length })}</h1>
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div className="flex min-w-0 items-center gap-3">
              {u.picture ? (
                <img src={u.picture} alt="" className="h-9 w-9 shrink-0 rounded-full" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                  {u.email.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{u.displayName || u.email}</p>
                <p className="truncate text-xs text-slate-500">{u.email}</p>
                <p className="text-xs text-slate-500">
                  {u.role === 'admin' ? t('adminUsers.roleAdmin') : t('adminUsers.roleMember')}
                </p>
              </div>
            </div>
            {u.id !== me?.id && (
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => run(() => setUserRole(u.id, u.role === 'admin' ? 'member' : 'admin'))}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  {u.role === 'admin' ? t('adminUsers.makeMember') : t('adminUsers.makeAdmin')}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    window.confirm(t('adminUsers.deleteConfirm', { email: u.email })) && run(() => deleteUser(u.id))
                  }
                  className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600"
                >
                  {t('adminUsers.delete')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
