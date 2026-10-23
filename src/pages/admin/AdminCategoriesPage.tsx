import { useEffect, useRef, useState } from 'react'
import { createCategory, deleteCategory, updateCategory, useCategories } from '../../hooks/data'
import { useTranslation } from '../../i18n'

/** Simpan warna setelah user berhenti memilih, supaya tidak mengirim request di setiap gerakan picker. */
function ColorInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => setLocal(value), [value])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return (
    <input
      type="color"
      value={local}
      onChange={(e) => {
        const v = e.target.value
        setLocal(v)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => v !== value && onSave(v), 700)
      }}
      className="h-8 w-8 shrink-0 rounded"
    />
  )
}

export function AdminCategoriesPage() {
  const { categories, loading } = useCategories()
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2563eb')

  const run = (fn: () => Promise<void>) =>
    fn().catch((e: Error) => window.alert(t('error.generic', { error: e.message })))

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold text-slate-900">{t('adminCategories.title')}</h1>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 p-3">
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-10 shrink-0 rounded" />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('adminCategories.namePlaceholder')}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            if (!name.trim()) return
            run(async () => {
              await createCategory(name.trim(), color)
              setName('')
              setColor('#2563eb')
            })
          }}
          className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
        >
          {t('adminCategories.add')}
        </button>
      </div>
      {loading && <p className="text-sm text-slate-500">{t('app.loading')}</p>}
      <ul className="space-y-2">
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
            <div className="flex min-w-0 items-center gap-2">
              <ColorInput value={c.color} onSave={(v) => run(() => updateCategory(c.id, { color: v }))} />
              <span className="truncate text-sm font-semibold text-slate-900">{c.name}</span>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  const n = window.prompt(t('adminCategories.renamePrompt'), c.name)?.trim()
                  if (n && n !== c.name) run(() => updateCategory(c.id, { name: n }))
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
              >
                {t('adminCategories.rename')}
              </button>
              <button
                type="button"
                onClick={() =>
                  window.confirm(t('adminCategories.deleteConfirm', { name: c.name })) && run(() => deleteCategory(c.id))
                }
                className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600"
              >
                {t('adminCategories.delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
