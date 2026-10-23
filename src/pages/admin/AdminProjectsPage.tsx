import { Link } from 'react-router'
import { useAdminProjects } from '../../hooks/data'
import { useTranslation } from '../../i18n'
import { ExcelButton } from '../../components/ExcelButton'

export function AdminProjectsPage() {
  const { projects, loading, renameProject, deleteProject } = useAdminProjects()
  const { t } = useTranslation()
  if (loading) return <p className="p-4 text-sm text-slate-500">{t('app.loading')}</p>

  const run = (fn: () => Promise<void>) =>
    fn().catch((e: Error) => window.alert(t('error.generic', { error: e.message })))

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold text-slate-900">{t('adminProjects.title', { count: projects.length })}</h1>
      <ul className="space-y-2">
        {projects.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <Link to={`/projects/${p.id}`} className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-500">{t('adminProjects.memberCount', { count: p.memberUids.length })}</p>
            </Link>
            <div className="flex shrink-0 gap-2">
              <ExcelButton
                projectId={p.id}
                className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => {
                  const name = window.prompt(t('adminProjects.renamePrompt'), p.name)?.trim()
                  if (name && name !== p.name) run(() => renameProject(p.id, name))
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                {t('adminProjects.rename')}
              </button>
              <button
                type="button"
                onClick={() =>
                  window.confirm(t('adminProjects.deleteConfirm', { name: p.name })) && run(() => deleteProject(p.id))
                }
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600"
              >
                {t('adminProjects.delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
