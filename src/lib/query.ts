import { useCallback, useEffect, useSyncExternalStore } from 'react'

/**
 * Cache data sederhana pengganti listener realtime Firestore:
 * data disimpan di memori + localStorage (bisa dibaca saat offline),
 * di-refresh berkala dan setelah ada perubahan.
 */
interface Entry<T = unknown> {
  data: T | undefined
  error: Error | null
  loading: boolean
  fetcher?: () => Promise<T>
  inflight?: Promise<void>
  /** Jika true, hasil fetch dari server tidak menimpa data lokal (ada perubahan yang masih antre). */
  hold?: () => boolean
  snapshot: Snapshot<T>
}

export interface Snapshot<T> {
  data: T | undefined
  error: Error | null
  loading: boolean
}

const STORAGE_PREFIX = 'ss-cache:'
const entries = new Map<string, Entry>()
const listeners = new Map<string, Set<() => void>>()

function readStorage<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function writeStorage(key: string, data: unknown) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data))
  } catch {
    /* storage penuh / tidak tersedia */
  }
}

function getEntry<T>(key: string): Entry<T> {
  let e = entries.get(key) as Entry<T> | undefined
  if (!e) {
    const data = readStorage<T>(key)
    e = { data, error: null, loading: data === undefined, snapshot: { data, error: null, loading: data === undefined } }
    entries.set(key, e as Entry)
  }
  return e
}

function emit(key: string) {
  const e = entries.get(key)
  if (e) e.snapshot = { data: e.data, error: e.error, loading: e.loading }
  listeners.get(key)?.forEach((l) => l())
}

export function fetchQuery(key: string): Promise<void> {
  const e = getEntry(key)
  if (!e.fetcher) return Promise.resolve()
  if (e.inflight) return e.inflight
  const fetcher = e.fetcher
  e.inflight = fetcher()
    .then((data) => {
      if (e.hold?.()) return
      e.data = data
      e.error = null
      writeStorage(key, data)
    })
    .catch((err: Error) => {
      e.error = err
    })
    .finally(() => {
      e.loading = false
      e.inflight = undefined
      emit(key)
    })
  return e.inflight
}

export function setQueryData<T>(key: string, updater: (prev: T | undefined) => T) {
  const e = getEntry<T>(key)
  e.data = updater(e.data)
  e.loading = false
  writeStorage(key, e.data)
  emit(key)
}

export function getQueryData<T>(key: string): T | undefined {
  return getEntry<T>(key).data
}

/** Refresh semua query yang key-nya diawali prefix. */
export function invalidate(prefix: string) {
  for (const key of entries.keys()) if (key.startsWith(prefix)) void fetchQuery(key)
}

export function clearQueryCache() {
  entries.clear()
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => localStorage.removeItem(k))
  } catch {
    /* ignore */
  }
}

const EMPTY: Snapshot<never> = { data: undefined, error: null, loading: false }

export function useQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: { refetchInterval?: number; hold?: () => boolean } = {},
): Snapshot<T> & { refetch: () => Promise<void> } {
  const { refetchInterval = 30000, hold } = options

  if (key) {
    const e = getEntry<T>(key)
    e.fetcher = fetcher
    e.hold = hold
  }

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => {}
      let set = listeners.get(key)
      if (!set) listeners.set(key, (set = new Set()))
      set.add(cb)
      return () => set.delete(cb)
    },
    [key],
  )
  const snapshot = useSyncExternalStore(subscribe, () =>
    key ? (getEntry<T>(key).snapshot as Snapshot<T>) : (EMPTY as Snapshot<T>),
  )

  useEffect(() => {
    if (!key) return
    void fetchQuery(key)
    const refresh = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void fetchQuery(key)
    }
    const id = refetchInterval > 0 ? window.setInterval(refresh, refetchInterval) : undefined
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    return () => {
      if (id) window.clearInterval(id)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [key, refetchInterval])

  const refetch = useCallback(() => (key ? fetchQuery(key) : Promise.resolve()), [key])
  return { ...snapshot, refetch }
}
