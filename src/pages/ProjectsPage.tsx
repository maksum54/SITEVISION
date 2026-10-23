import { useState } from 'react'
import { Link } from 'react-router'
import { useProjects } from '../hooks/data'
import { useTranslation } from '../i18n'

export function ProjectsPage() {
  const { projects, loading, error, createProject, deleteProject } = useProjects()
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')

  const onDelete = async (id: string, projectName: string) => {
    if (!window.confirm(t('projects.deleteConfirm', { name: projectName }))) return
    try {
      await deleteProject(id)
    } catch (e) {
      window.alert(t('error.generic', { error: (e as Error).message }))
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">{t('projects.title')}</h1>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {t('projects.new')}
        </button>
      </div>
      {showForm && (
        <div className="mb-4 flex gap-2 rounded-lg border border-slate-200 p-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('projects.namePlaceholder')}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) return
              // Proyek langsung muncul di daftar; penyimpanan berjalan di belakang.
              createProject(name.trim()).catch((e: Error) => window.alert(t('error.generic', { error: e.message })))
              setName('')
              setShowForm(false)
            }}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {t('projects.save')}
          </button>
        </div>
      )}
      {loading && <p className="text-sm text-slate-500">{t('app.loading')}</p>}
      {error && !loading && projects.length === 0 && (
        <p className="mb-2 text-sm text-red-600">{t('error.generic', { error: error.message })}</p>
      )}
      {!loading && !error && projects.length === 0 && <p className="text-sm text-slate-500">{t('projects.empty')}</p>}
      <ul className="space-y-2">
        {projects.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-200">
            {p.localPending ? (
              <div className="flex flex-1 items-center justify-between p-4">
                <span className="font-semibold text-slate-500">{p.name}</span>
                <span className="text-xs text-slate-400">{t('pinForm.saving')}</span>
              </div>
            ) : (
              <Link to={`/projects/${p.id}`} className="flex-1 p-4 active:bg-slate-50">
                <span className="font-semibold text-slate-900">{p.name}</span>
              </Link>
            )}
            {!p.localPending && (
              <button
                type="button"
                onClick={() => onDelete(p.id, p.name)}
                aria-label={t('projects.delete')}
                className="mr-3 shrink-0 rounded-lg border border-red-300 px-2 py-1.5 text-xs font-medium text-red-600"
              >
                🗑
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
