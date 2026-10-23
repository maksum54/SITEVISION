const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined
const TOKEN_KEY = 'ss-token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

/** Dipanggil saat sesi tidak valid lagi (401) atau user dinonaktifkan (403 BANNED). */
let onAuthError: ((e: ApiError) => void) | null = null
export function setAuthErrorHandler(fn: (e: ApiError) => void) {
  onAuthError = fn
}

/** Gagal menghubungi server (offline / jaringan putus). Aman untuk dicoba ulang. */
export class NetworkError extends Error {}

/** Server menolak request (validasi, izin, data tidak ditemukan). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

interface ApiResponse<T> {
  ok: boolean
  data?: T
  status?: number
  error?: string
}

const PUBLIC_ACTIONS = new Set(['loginGoogle'])
// Request besar / khusus dikirim sendiri, tidak digabung.
const UNBATCHED = new Set(['loginGoogle', 'logout', 'uploadPlan', 'uploadPinPhoto', 'exportExcel'])
const BATCH_WINDOW_MS = 15
const BATCH_MAX = 20

async function post<T>(body: Record<string, unknown>, isPublic: boolean): Promise<T> {
  if (!API_URL) throw new ApiError('VITE_APPS_SCRIPT_URL belum diatur. Lihat README.md.', 500)
  const token = getToken()
  if (!token && !isPublic) throw new ApiError('UNAUTHORIZED', 401)

  let res: Response
  try {
    // text/plain supaya tidak memicu CORS preflight (Apps Script tidak mendukung OPTIONS)
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, token }),
    })
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : String(e))
  }
  if (!res.ok) throw new NetworkError(`HTTP ${res.status}`)

  let parsed: ApiResponse<T>
  try {
    parsed = await res.json()
  } catch {
    throw new ApiError('Respons server tidak valid. Pastikan Web App Apps Script di-deploy dengan akses "Anyone".', 500)
  }
  return unwrap(parsed, isPublic)
}

function unwrap<T>(res: ApiResponse<T>, isPublic: boolean): T {
  if (!res.ok) {
    const err = new ApiError(res.error ?? 'Server error', res.status ?? 500)
    if (!isPublic && (err.status === 401 || err.message === 'BANNED')) onAuthError?.(err)
    throw err
  }
  return res.data as T
}

interface Queued {
  action: string
  payload: Record<string, unknown>
  resolve: (v: unknown) => void
  reject: (e: unknown) => void
}

let queue: Queued[] = []
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Request yang terjadi hampir bersamaan (mis. saat membuka halaman) digabung
 * menjadi satu request "batch", supaya hanya sekali bolak-balik ke Apps Script.
 */
async function flushQueue() {
  timer = undefined
  const calls = queue.splice(0, BATCH_MAX)
  if (queue.length) timer = setTimeout(flushQueue, 0)
  if (calls.length === 1) {
    const c = calls[0]
    post({ action: c.action, payload: c.payload }, false).then(c.resolve, c.reject)
    return
  }
  try {
    const results = await post<ApiResponse<unknown>[]>(
      { action: 'batch', calls: calls.map((c) => ({ action: c.action, payload: c.payload })) },
      false,
    )
    calls.forEach((c, i) => {
      try {
        c.resolve(unwrap(results[i] ?? { ok: false, error: 'Missing batch result' }, false))
      } catch (e) {
        c.reject(e)
      }
    })
  } catch (e) {
    calls.forEach((c) => c.reject(e))
  }
}

/** Panggil action di Google Apps Script (apps-script/Code.gs). */
export function api<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (UNBATCHED.has(action)) return post<T>({ action, payload }, PUBLIC_ACTIONS.has(action))
  return new Promise<T>((resolve, reject) => {
    queue.push({ action, payload, resolve: resolve as (v: unknown) => void, reject })
    timer ??= setTimeout(flushQueue, BATCH_WINDOW_MS)
  })
}

/** ID buatan aplikasi, supaya data baru bisa langsung tampil sebelum tersimpan di server. */
export function newId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export function downloadBase64(base64: string, fileName: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
