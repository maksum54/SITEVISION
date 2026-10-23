import { openDB, type IDBPDatabase } from 'idb'
import { api, ApiError, blobToBase64 } from './api'
import { fetchQuery, setQueryData } from './query'
import type { Pin } from '../types'

/**
 * Antrean perubahan temuan (pin) & foto.
 * Semua perubahan langsung tampil di layar (optimistic), lalu dikirim ke
 * Apps Script secara berurutan. Saat offline, antrean disimpan di IndexedDB
 * dan dikirim otomatis begitu online lagi.
 */
type PinRef = { projectId: string; planId: string; pinId: string }

export type OutboxOp =
  | (PinRef & { kind: 'createPin'; pin: Pin })
  | (PinRef & { kind: 'updatePin'; patch: Partial<Pick<Pin, 'status' | 'category' | 'notes'>> })
  | (PinRef & { kind: 'deletePin' })
  | (PinRef & { kind: 'uploadPhoto'; blob: Blob; fileName: string; contentType: string })

type StoredOp = OutboxOp & { seq?: number }

const DB_NAME = 'survey-outbox'
const STORE = 'ops'

let dbPromise: Promise<IDBPDatabase> | null = null
function db() {
  dbPromise ||= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true })
    },
  })
  return dbPromise
}

let pending: StoredOp[] = []
let loaded: Promise<void> | null = null
let flushing = false
const localPhotoUrls = new Map<string, string>()
const countListeners = new Set<(s: OutboxStatus) => void>()

export interface OutboxStatus {
  total: number
  photos: number
}

export function pinsKey(projectId: string, planId: string) {
  return `pins:${projectId}:${planId}`
}

export function hasPendingFor(projectId: string, planId: string) {
  return pending.some((op) => op.projectId === projectId && op.planId === planId)
}

function status(): OutboxStatus {
  return { total: pending.length, photos: pending.filter((op) => op.kind === 'uploadPhoto').length }
}

function notify() {
  const s = status()
  countListeners.forEach((l) => l(s))
}

export function subscribeOutbox(listener: (s: OutboxStatus) => void) {
  countListeners.add(listener)
  void load().then(() => listener(status()))
  return () => {
    countListeners.delete(listener)
  }
}

function updatePins(op: PinRef, fn: (pins: Pin[]) => Pin[]) {
  setQueryData<Pin[]>(pinsKey(op.projectId, op.planId), (prev) => fn(prev ?? []))
}

function applyOptimistic(op: OutboxOp) {
  switch (op.kind) {
    case 'createPin':
      updatePins(op, (pins) => (pins.some((p) => p.id === op.pinId) ? pins : [...pins, { ...op.pin, localPending: true }]))
      break
    case 'updatePin':
      updatePins(op, (pins) => pins.map((p) => (p.id === op.pinId ? { ...p, ...op.patch, updatedAt: Date.now() } : p)))
      break
    case 'deletePin':
      updatePins(op, (pins) => pins.filter((p) => p.id !== op.pinId))
      break
    case 'uploadPhoto': {
      const old = localPhotoUrls.get(op.pinId)
      if (old) URL.revokeObjectURL(old)
      const url = URL.createObjectURL(op.blob)
      localPhotoUrls.set(op.pinId, url)
      updatePins(op, (pins) =>
        pins.map((p) => (p.id === op.pinId ? { ...p, photoURL: url, localPhotoPending: true } : p)),
      )
      break
    }
  }
}

function load() {
  loaded ||= (async () => {
    try {
      pending = (await (await db()).getAll(STORE)) as StoredOp[]
      pending.forEach(applyOptimistic)
    } catch (e) {
      console.error('Outbox: gagal membaca IndexedDB', e)
    }
  })()
  return loaded
}

export async function enqueue(op: OutboxOp) {
  await load()
  applyOptimistic(op)
  const stored: StoredOp = { ...op }
  try {
    stored.seq = (await (await db()).add(STORE, stored)) as number
  } catch (e) {
    console.error('Outbox: gagal menyimpan ke IndexedDB', e)
  }
  pending.push(stored)
  notify()
  void flush()
}

async function send(op: OutboxOp): Promise<Pin | null> {
  const ref = { projectId: op.projectId, planId: op.planId }
  switch (op.kind) {
    case 'createPin':
      return api<Pin>('createPin', { ...ref, id: op.pinId, x: op.pin.x, y: op.pin.y, createdAt: op.pin.createdAt })
    case 'updatePin':
      return api<Pin>('updatePin', { ...ref, pinId: op.pinId, patch: op.patch })
    case 'deletePin':
      await api('deletePin', { ...ref, pinId: op.pinId })
      return null
    case 'uploadPhoto':
      return api<Pin>('uploadPinPhoto', {
        ...ref,
        pinId: op.pinId,
        fileName: op.fileName,
        mimeType: op.contentType,
        base64: await blobToBase64(op.blob),
      })
  }
}

async function remove(op: StoredOp) {
  pending = pending.filter((p) => p !== op)
  if (op.seq !== undefined) {
    try {
      await (await db()).delete(STORE, op.seq)
    } catch (e) {
      console.error('Outbox: gagal menghapus dari IndexedDB', e)
    }
  }
  notify()
}

export async function flush() {
  await load()
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    while (pending.length) {
      const op = pending[0]
      let result: Pin | null = null
      try {
        result = await send(op)
      } catch (e) {
        if (e instanceof ApiError && e.status !== 401 && e.status !== 500) {
          // Ditolak server (mis. pin sudah dihapus) — buang dan sinkronkan ulang.
          console.error('Outbox: perubahan ditolak server', op.kind, e)
          await remove(op)
          void fetchQuery(pinsKey(op.projectId, op.planId))
          continue
        }
        break // jaringan / server sementara bermasalah, coba lagi nanti
      }
      await remove(op)
      const stillPending = pending.some((p) => p.pinId === op.pinId)
      if (result && !stillPending) {
        const fresh = result
        const local = localPhotoUrls.get(op.pinId)
        if (local && op.kind === 'uploadPhoto') {
          localPhotoUrls.delete(op.pinId)
          setTimeout(() => URL.revokeObjectURL(local), 60000)
        }
        updatePins(op, (pins) => pins.map((p) => (p.id === fresh.id ? fresh : p)))
      }
    }
  } finally {
    flushing = false
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush())
  setInterval(() => {
    if (navigator.onLine) void flush()
  }, 30000)
}
