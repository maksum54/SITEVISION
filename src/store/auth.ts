import { create } from 'zustand'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { api, ApiError } from '../lib/api'
import { clearQueryCache } from '../lib/query'
import { flush } from '../lib/outbox'
import type { UserProfile } from '../types'

interface AuthState {
  user: User | null
  profile: UserProfile | null
  initializing: boolean
  error: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  loadProfile: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  initializing: true,
  error: null,
  login: async (email, password) => {
    set({ error: null })
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (e) {
      set({ error: (e as Error).message })
      throw e
    }
  },
  register: async (email, password) => {
    set({ error: null })
    try {
      await createUserWithEmailAndPassword(auth, email, password)
      // Profil user dibuat otomatis di sheet "users" saat request pertama ke Apps Script.
      await get().loadProfile()
    } catch (e) {
      set({ error: (e as Error).message })
      throw e
    }
  },
  logout: async () => {
    clearQueryCache()
    set({ profile: null })
    await signOut(auth)
  },
  loadProfile: async () => {
    if (!auth.currentUser) return
    try {
      const profile = await api<UserProfile>('me')
      set({ profile })
      try {
        localStorage.setItem('ss-profile', JSON.stringify(profile))
      } catch {
        /* ignore */
      }
    } catch (e) {
      if (e instanceof ApiError && e.message === 'BANNED') {
        sessionStorage.setItem('banned', '1')
        await get().logout()
      }
    }
  },
}))

function cachedProfile(uid: string): UserProfile | null {
  try {
    const p = JSON.parse(localStorage.getItem('ss-profile') ?? 'null') as UserProfile | null
    return p && p.id === uid ? p : null
  } catch {
    return null
  }
}

onAuthStateChanged(auth, (user) => {
  useAuth.setState({ user, initializing: false, profile: user ? cachedProfile(user.uid) : null })
  if (user) {
    void useAuth.getState().loadProfile()
    void flush()
  }
})
