/** Google Identity Services ("Masuk dengan Google"). */
// Client ID bersifat publik (bukan rahasia); bisa ditimpa lewat VITE_GOOGLE_CLIENT_ID.
export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || '240395032173-vi789j2m350igme7j849r72v5s2vghoa.apps.googleusercontent.com'

interface GoogleId {
  initialize(config: {
    client_id: string
    callback: (res: { credential: string }) => void
    auto_select?: boolean
    use_fedcm_for_prompt?: boolean
  }): void
  renderButton(
    parent: HTMLElement,
    options: { theme?: string; size?: string; text?: string; shape?: string; width?: number; locale?: string },
  ): void
  disableAutoSelect(): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } }
  }
}

let loader: Promise<GoogleId> | null = null

export function loadGoogleIdentity(): Promise<GoogleId> {
  loader ||= new Promise<GoogleId>((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id)
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => (window.google ? resolve(window.google.accounts.id) : reject(new Error('Google Sign-In gagal dimuat')))
    script.onerror = () => {
      loader = null
      reject(new Error('Google Sign-In gagal dimuat. Periksa koneksi internet.'))
    }
    document.head.appendChild(script)
  })
  return loader
}

export function disableGoogleAutoSelect() {
  window.google?.accounts?.id.disableAutoSelect()
}
