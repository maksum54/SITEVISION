import { useAdminPhotos } from '../../hooks/data'
import { useTranslation } from '../../i18n'

export function AdminPhotosPage() {
  const { pins, loading, deletePhoto } = useAdminPhotos()
  const { t } = useTranslation()
  if (loading) return <p className="p-4 text-sm text-slate-500">{t('app.loading')}</p>

  return (
    <div className="p-4">
      <h1 className="mb-3 text-xl font-bold text-slate-900">{t('adminPhotos.title', { count: pins.length })}</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pins.map((pin) => (
          <div key={pin.id} className="overflow-hidden rounded-lg border border-slate-200">
            <a href={`https://drive.google.com/file/d/${pin.photoFileId}/view`} target="_blank" rel="noreferrer">
              <img
                src={pin.photoURL}
                referrerPolicy="no-referrer"
                alt={pin.category}
                className="aspect-square w-full object-cover"
              />
            </a>
            <div className="p-2">
              <p className="truncate text-xs font-semibold text-slate-900">{pin.category}</p>
              <p className="truncate text-xs text-slate-500">{pin.createdByName}</p>
              <button
                type="button"
                onClick={() =>
                  window.confirm(t('adminPhotos.deleteConfirm')) &&
                  deletePhoto(pin).catch((e: Error) => window.alert(t('error.generic', { error: e.message })))
                }
                className="mt-1 w-full rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600"
              >
                {t('adminPhotos.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
