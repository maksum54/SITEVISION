import { useExcelExport } from '../hooks/data'
import { useTranslation, type TKey } from '../i18n'

export function ExcelButton({
  projectId,
  planId,
  label = 'export.excel',
  className = 'shrink-0 rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-medium text-emerald-700 disabled:opacity-50',
}: {
  projectId?: string
  planId?: string
  label?: TKey
  className?: string
}) {
  const { t } = useTranslation()
  const { exporting, exportExcel } = useExcelExport()
  return (
    <button
      type="button"
      disabled={exporting}
      onClick={async () => {
        try {
          await exportExcel({ projectId, planId })
        } catch (e) {
          window.alert(t('export.failed', { error: (e as Error).message }))
        }
      }}
      className={className}
    >
      {exporting ? t('export.exporting') : t(label)}
    </button>
  )
}
