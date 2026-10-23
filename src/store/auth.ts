import { create } from 'zustand'
import { api, ApiError, getToken, setAuthErrorHandler, setToken } from '../lib/api'
import { clearQueryCache } from '../lib/query'
import { flush } from '../lib/outbox'
import { disableGoogleAutoSelect } from '../lib/googleSignIn'
import type { UserProfile } from '../types'

/** Login dengan akun Google; sesi dikelola Google Apps Script (apps-script/Code.gs). */
interface AuthState {
  user: UserProfile | null
  initializing: boolean
  error: string | null
  loginWithGoogle: (credential: string) => Promise<void>
  setError: (error: string | null) => void
  logout: () => Promise<void>
  loadProfile: () => Promise<void>
}

const PROFILE_KEY = 'ss-profile'

function cachedProfile(): UserProfile | null {
  try {
    return getToken() ? (JSON.parse(localStorage.getItem(PROFILE_KEY) ?? 'null') as UserProfile | null) : null
  } catch {
    return null
  }
}

function saveProfile(user: UserProfile | null) {
  try {
    if (user) localStorage.setItem(PROFILE_KEY, JSON.stringify(user))
    else localStorage.removeItem(PROFILE_KEY)
  } catch {
    /* ignore */
  }
}

function clearSession() {
  setToken(null)
  saveProfile(null)
  clearQueryCache()
  useAuth.setState({ user: null })
}

export const useAuth = create<AuthState>((set) => {
  const loginWithGoogle = async (credential: string) => {
    set({ error: null })
    try {
      const res = await api<{ token: string; user: UserProfile }>('loginGoogle', { credential })
      clearQueryCache()
      setToken(res.token)
      saveProfile(res.user)
      set({ user: res.user })
      void flush()
    } catch (e) {
      set({ error: e instanceof ApiError ? e.message : (e as Error).message })
      throw e
    }
  }

  return {
    user: cachedProfile(),
    initializing: false,
    error: null,
    loginWithGoogle,
    setError: (error) => set({ error }),
    logout: async () => {
      try {
        if (navigator.onLine) await api('logout')
      } catch {
        /* sesi mungkin sudah tidak berlaku */
      }
      disableGoogleAutoSelect()
      clearSession()
    },
    loadProfile: async () => {
      if (!getToken()) return
      try {
        const user = await api<UserProfile>('me')
        saveProfile(user)
        set({ user })
      } catch {
        /* offline: tetap pakai profil tersimpan; 401/BANNED ditangani di bawah */
      }
    },
  }
})

setAuthErrorHandler((e) => {
  if (e.message === 'BANNED') sessionStorage.setItem('banned', '1')
  clearSession()
})

if (getToken()) {
  void useAuth.getState().loadProfile()
  void flush()
}
