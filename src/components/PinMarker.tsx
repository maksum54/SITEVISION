import { useTranslation } from '../i18n'
import type { Pin, PinStatus } from '../types'

export const STATUS_COLORS: Record<PinStatus, string> = { open: '#dc2626', in_progress: '#d97706', done: '#16a34a' }

export function PinMarker({
  pin,
  categoryColor,
  zoomScale = 1,
  onSelect,
}: {
  pin: Pin
  categoryColor: string
  zoomScale?: number
  onSelect: (pin: Pin) => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onSelect(pin)
      }}
      className="absolute flex h-7 w-7 items-center justify-center rounded-full border-[3px] shadow-md"
      style={{
        left: `${pin.x * 100}%`,
        top: `${pin.y * 100}%`,
        backgroundColor: categoryColor,
        borderColor: STATUS_COLORS[pin.status],
        transform: `translate(-50%, -100%) scale(${1 / zoomScale})`,
        transformOrigin: 'center bottom',
      }}
      aria-label={t('planViewer.pinLabel', { category: pin.category, status: t(`status.${pin.status}`) })}
    >
      {(pin.localPhotoPending || pin.localPending) && (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400" />
      )}
    </button>
  )
}
