import { useEffect, useState } from 'react'
import { subscribeOutbox, type OutboxStatus } from '../lib/outbox'
import { useTranslation } from '../i18n'

export function SyncBanner() {
  const { t } = useTranslation()
  const [online, setOnline] = useState(navigator.onLine)
  const [status, setStatus] = useState<OutboxStatus>({ total: 0, photos: 0 })

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const unsub = subscribeOutbox(setStatus)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      unsub()
    }
  }, [])

  if (online && status.total === 0) return null
  return (
    <div
      className={`px-4 py-1.5 text-center text-xs font-medium text-white ${online ? 'bg-amber-500' : 'bg-slate-600'}`}
    >
      {online ? t('sync.syncing', { count: status.total }) : t('sync.offline')}
    </div>
  )
}
