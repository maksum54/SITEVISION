import { useStorageStats } from '../../hooks/data'
import { useTranslation } from '../../i18n'
import { ExcelButton } from '../../components/ExcelButton'

function formatBytes(n: number) {
  if (!n || isNaN(n)) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(2)} ${units[i]}`
}

function barColor(pct: number) {
  return pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const { t } = useTranslation()
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="text-slate-500">
          {formatBytes(used)} / {limit > 0 ? formatBytes(limit) : '∞'}
        </span>
      </div>
      <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full transition-all ${barColor(pct)}`} style={{ width: `${Math.max(pct, 0.3)}%` }} />
      </div>
      <p className="text-right text-xs text-slate-400">
        {pct.toFixed(2)}% {t('adminStorage.used')}
      </p>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-white/80">{label}</p>
    </div>
  )
}

export function AdminStoragePage() {
  const { t } = useTranslation()
  const { stats, loading, error, refetch } = useStorageStats()
  const pct = stats && stats.driveLimit > 0 ? (stats.driveUsed / stats.driveLimit) * 100 : 0

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-slate-900">{t('adminStorage.title')}</h1>
        <ExcelButton label="adminStorage.exportAll" />
      </div>

      {loading && !stats && <p className="text-sm text-slate-500">{t('app.loading')}</p>}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="mb-1 font-semibold">{t('adminStorage.errorTitle')}</p>
          <p className="mb-3 font-mono text-xs">{error.message}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mb-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            {t('adminStorage.retry')}
          </button>
          <p className="text-slate-700">{t('adminStorage.errorSetup')}</p>
        </div>
      )}

      {stats && (
        <>
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              {t('adminStorage.appStats')}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard label={t('adminStorage.statUsers')} value={stats.users} color="bg-slate-700" />
              <StatCard label={t('adminStorage.statProjects')} value={stats.projects} color="bg-blue-600" />
              <StatCard label={t('adminStorage.statPlans')} value={stats.plans} color="bg-cyan-600" />
              <StatCard label={t('adminStorage.statPins')} value={stats.pins} color="bg-amber-600" />
              <StatCard label={t('adminStorage.statPhotos')} value={stats.photos} color="bg-purple-600" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              {t('adminStorage.drive')}
            </h2>
            <div className="space-y-5 rounded-xl border border-slate-200 p-4">
              <div className="flex justify-end">
                <span className="text-xs text-slate-400">
                  {t('adminStorage.lastUpdated')}: {new Date(stats.lastUpdated).toLocaleString()}
                </span>
              </div>
              <UsageBar label={t('adminStorage.driveAccount')} used={stats.driveUsed} limit={stats.driveLimit} />
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-xl font-bold text-slate-900">{stats.appFiles}</p>
                  <p className="text-xs text-slate-500">{t('adminStorage.appFiles')}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-center">
                  <p className="text-xl font-bold text-slate-900">{formatBytes(stats.appBytes)}</p>
                  <p className="text-xs text-slate-500">{t('adminStorage.appSize')}</p>
                </div>
              </div>
              {pct >= 70 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  ⚠️ {t('adminStorage.warningHigh')}
                </div>
              )}
              <a
                href={stats.folderUrl}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-slate-300 px-3 py-2 text-center text-sm font-medium text-slate-700"
              >
                {t('adminStorage.openFolder')}
              </a>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
              {t('adminStorage.data')}
            </h2>
            <a
              href={stats.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="block rounded-lg border border-emerald-600 px-3 py-2 text-center text-sm font-medium text-emerald-700"
            >
              {t('adminStorage.openSpreadsheet')}
            </a>
          </section>
        </>
      )}
    </div>
  )
}
