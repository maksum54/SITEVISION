import { create } from 'zustand'
import { api, ApiError, getToken, setAuthErrorHandler, setToken } from '../lib/api'
import { clearQueryCache } from '../lib/query'
import { flush } from '../lib/outbox'
import type { UserProfile } from '../types'

/** Akun & sesi login dikelola Google Apps Script (apps-script/Code.gs), tanpa Firebase. */
interface AuthState {
  user: UserProfile | null
  initializing: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
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
  const signIn = async (action: 'login' | 'register', email: string, password: string) => {
    set({ error: null })
    try {
      const res = await api<{ token: string; user: UserProfile }>(action, { email, password })
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
    login: (email, password) => signIn('login', email, password),
    register: (email, password) => signIn('register', email, password),
    logout: async () => {
      try {
        if (navigator.onLine) await api('logout')
      } catch {
        /* sesi mungkin sudah tidak berlaku */
      }
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
