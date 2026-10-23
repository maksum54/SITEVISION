import { useState, type ChangeEvent } from 'react'
import { useCategories } from '../hooks/data'
import { useTranslation } from '../i18n'
import type { Pin, PinStatus } from '../types'

const STATUSES: PinStatus[] = ['open', 'in_progress', 'done']

export function PinForm({
  pin,
  onClose,
  onUpdate,
  onUploadPhoto,
}: {
  pin: Pin
  onClose: () => void
  onUpdate: (pinId: string, patch: Partial<Pick<Pin, 'status' | 'category' | 'notes'>>) => Promise<void>
  onUploadPhoto: (pinId: string, file: File) => Promise<void>
}) {
  const { categories } = useCategories()
  const { t } = useTranslation()
  const [notes, setNotes] = useState(pin.notes)
  const [category, setCategory] = useState(pin.category)
  const [status, setStatus] = useState(pin.status)
  const [processing, setProcessing] = useState(false)
  const [viewerOpen, setViewerOpen] = useState(false)

  const save = (patch: Partial<Pick<Pin, 'status' | 'category' | 'notes'>>) => {
    void onUpdate(pin.id, patch)
  }

  const onPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcessing(true)
    try {
      await onUploadPhoto(pin.id, file)
    } catch (err) {
      window.alert(t('error.generic', { error: (err as Error).message }))
    } finally {
      setProcessing(false)
    }
  }

  const photo = pin.photoURL
  const categoryOptions = categories.some((c) => c.name === category)
    ? categories
    : [...categories, { id: `__${category}`, name: category, color: '', createdAt: 0 }]

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
      <div className="w-full rounded-t-2xl bg-white p-4 sm:max-w-md sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{t('pinForm.title')}</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400">
            ×
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('pinForm.status')}</label>
            <div className="flex gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStatus(s)
                    save({ status: s })
                  }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${status === s ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 text-slate-700'}`}
                >
                  {t(`status.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('pinForm.category')}</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                save({ category: e.target.value })
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none"
            >
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('pinForm.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => notes !== pin.notes && save({ notes })}
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-slate-900 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t('pinForm.photo')}</label>
            {photo && (
              <button type="button" onClick={() => setViewerOpen(true)} className="mb-2 block w-full">
                <img
                  src={photo}
                  referrerPolicy="no-referrer"
                  alt={t('pinForm.photoAlt')}
                  className="h-40 w-full rounded-lg object-cover"
                />
              </button>
            )}
            {pin.localPhotoPending && <p className="mb-2 text-xs text-amber-600">{t('pinForm.photoPending')}</p>}
            <label className="block w-full cursor-pointer rounded-lg border border-dashed border-slate-300 px-3 py-3 text-center text-sm font-medium text-slate-600">
              {t(processing ? 'pinForm.uploadingPhoto' : photo ? 'pinForm.changePhoto' : 'pinForm.takePhoto')}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
            </label>
          </div>
        </div>
      </div>
      {viewerOpen && photo && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewerOpen(false)}
        >
          <button
            type="button"
            onClick={() => setViewerOpen(false)}
            className="absolute right-4 top-4 text-3xl leading-none text-white"
            aria-label={t('pinForm.close')}
          >
            ×
          </button>
          <img
            src={photo}
            referrerPolicy="no-referrer"
            alt={t('pinForm.photoAlt')}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
