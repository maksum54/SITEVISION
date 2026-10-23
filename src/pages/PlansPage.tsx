import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { usePlans } from '../hooks/data'
import { useTranslation } from '../i18n'
import { ExcelButton } from '../components/ExcelButton'

function UploadPlan({ onUpload }: { onUpload: (name: string, file: File) => Promise<void> }) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')

  if (file)
    return (
      <div className="mb-4 flex gap-2 rounded-lg border border-slate-200 p-3">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('plans.namePlaceholder')}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            if (!name.trim()) return
            // Denah langsung muncul di daftar; unggahan berjalan di belakang.
            onUpload(name.trim(), file).catch((e: Error) => window.alert(t('error.generic', { error: e.message })))
            setFile(null)
            setName('')
            if (inputRef.current) inputRef.current.value = ''
          }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {t('plans.uploadConfirm')}
        </button>
      </div>
    )

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) {
            setFile(f)
            setName(f.name.replace(/\.[^/.]+$/, ''))
          }
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
      >
        {t('plans.upload')}
      </button>
    </>
  )
}

export function PlansPage() {
  const { projectId } = useParams()
  const { plans, loading, error, uploadPlan, deletePlan } = usePlans(projectId)
  const { t } = useTranslation()

  const onDelete = async (id: string, name: string) => {
    if (!window.confirm(t('plans.deleteConfirm', { name }))) return
    try {
      await deletePlan(id)
    } catch (e) {
      window.alert(t('error.generic', { error: (e as Error).message }))
    }
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">{t('plans.title')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          {plans.length > 0 && <ExcelButton projectId={projectId} />}
          <UploadPlan onUpload={uploadPlan} />
        </div>
      </div>
      {loading && <p className="text-sm text-slate-500">{t('app.loading')}</p>}
      {error && !loading && plans.length === 0 && (
        <p className="mb-2 text-sm text-red-600">{t('error.generic', { error: error.message })}</p>
      )}
      {!loading && !error && plans.length === 0 && <p className="text-sm text-slate-500">{t('plans.empty')}</p>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <li key={p.id} className="relative">
            {p.localPending ? (
              <div className="block overflow-hidden rounded-lg border border-slate-200">
                <div className="relative aspect-square w-full bg-slate-100">
                  {p.imageURL && (
                    <img src={p.imageURL} alt={p.name} className="h-full w-full object-cover opacity-60" />
                  )}
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-slate-700">
                    {t('plans.uploading')}
                  </span>
                </div>
                <span className="block truncate p-2 text-sm font-medium text-slate-500">{p.name}</span>
              </div>
            ) : (
              <Link
                to={`/projects/${projectId}/plans/${p.id}`}
                className="block overflow-hidden rounded-lg border border-slate-200 active:opacity-80"
              >
                <img
                  src={p.imageURL}
                  referrerPolicy="no-referrer"
                  alt={p.name}
                  className="aspect-square w-full object-cover"
                />
                <span className="block truncate p-2 text-sm font-medium text-slate-900">{p.name}</span>
              </Link>
            )}
            {!p.localPending && (
              <button
                type="button"
                onClick={() => onDelete(p.id, p.name)}
                aria-label={t('plans.delete')}
                className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-red-600/80 text-sm text-white backdrop-blur-sm"
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
