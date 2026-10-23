import { auth } from './firebase'

const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined

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

/** Panggil action di Google Apps Script (apps-script/Code.gs). */
export async function api<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!API_URL) throw new ApiError('VITE_APPS_SCRIPT_URL belum diatur. Lihat README.md.', 500)
  const user = auth.currentUser
  if (!user) throw new ApiError('Not signed in', 401)

  let res: Response
  try {
    const idToken = await user.getIdToken()
    // text/plain supaya tidak memicu CORS preflight (Apps Script tidak mendukung OPTIONS)
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, idToken, payload }),
    })
  } catch (e) {
    throw new NetworkError(e instanceof Error ? e.message : String(e))
  }
  if (!res.ok) throw new NetworkError(`HTTP ${res.status}`)

  let body: ApiResponse<T>
  try {
    body = await res.json()
  } catch {
    throw new ApiError('Respons server tidak valid. Pastikan Web App Apps Script di-deploy dengan akses "Anyone".', 500)
  }
  if (!body.ok) throw new ApiError(body.error ?? 'Server error', body.status ?? 500)
  return body.data as T
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
