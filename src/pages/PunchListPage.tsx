import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { usePins } from '../hooks/data'
import { useTranslation } from '../i18n'
import { PinForm } from '../components/PinForm'
import { STATUS_COLORS } from '../components/PinMarker'
import { ExcelButton } from '../components/ExcelButton'
import type { PinStatus } from '../types'

type Filter = 'all' | PinStatus
const FILTERS: Filter[] = ['all', 'open', 'in_progress', 'done']

function StatusFilter({
  value,
  onChange,
  counts,
}: {
  value: Filter
  onChange: (f: Filter) => void
  counts: Record<Filter, number>
}) {
  const { t } = useTranslation()
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium ${value === f ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'}`}
        >
          {t(f === 'all' ? 'status.all' : `status.${f}`)} ({counts[f]})
        </button>
      ))}
    </div>
  )
}

export function PunchListPage() {
  const { projectId, planId } = useParams()
  const { pins, updatePin, deletePin, uploadPhoto } = usePins(projectId, planId)
  const { t } = useTranslation()
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: pins.length, open: 0, in_progress: 0, done: 0 }
    for (const p of pins) c[p.status]++
    return c
  }, [pins])

  const visible = filter === 'all' ? pins : pins.filter((p) => p.status === filter)
  const selected = pins.find((p) => p.id === selectedId) ?? null

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link
          to={`/projects/${projectId}/plans/${planId}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-700"
          aria-label={t('punchList.backToPlan')}
        >
          ←
        </Link>
        <h1 className="flex-1 text-xl font-bold text-slate-900">{t('punchList.title')}</h1>
        {pins.length > 0 && <ExcelButton projectId={projectId} planId={planId} />}
      </div>
      <div className="mb-4">
        <StatusFilter value={filter} onChange={setFilter} counts={counts} />
      </div>
      {visible.length === 0 && <p className="text-sm text-slate-500">{t('punchList.empty')}</p>}
      <ul className="space-y-2">
        {visible.map((pin) => (
          <li key={pin.id} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3">
            <button
              type="button"
              onClick={() => setSelectedId(pin.id)}
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
            >
              {pin.photoURL ? (
                <img
                  src={pin.photoURL}
                  referrerPolicy="no-referrer"
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-md object-cover"
                />
              ) : (
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ backgroundColor: STATUS_COLORS[pin.status] }}
                >
                  <span className="text-xs font-semibold">{t(`status.${pin.status}`)}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{pin.category}</p>
                <p className="truncate text-sm text-slate-500">{pin.notes || t('punchList.noNotes')}</p>
                <p className="text-xs text-slate-400">{pin.createdByName}</p>
              </div>
            </button>
            <span
              className="shrink-0 rounded-full px-2 py-1 text-xs font-medium text-white"
              style={{ backgroundColor: STATUS_COLORS[pin.status] }}
            >
              {t(`status.${pin.status}`)}
            </span>
            <button
              type="button"
              onClick={() => window.confirm(t('punchList.deleteConfirm')) && void deletePin(pin.id)}
              aria-label={t('punchList.delete')}
              className="shrink-0 rounded-lg border border-red-300 px-2 py-1.5 text-xs font-medium text-red-600"
            >
              🗑
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <PinForm
          key={selected.id}
          pin={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={updatePin}
          onUploadPhoto={uploadPhoto}
        />
      )}
    </div>
  )
}
