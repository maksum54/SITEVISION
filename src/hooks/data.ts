import { useState } from 'react'
import { api, blobToBase64, downloadBase64, newId } from '../lib/api'
import { getQueryData, invalidate, setQueryData, useQuery } from '../lib/query'
import { enqueue, hasPendingFor, pinsKey } from '../lib/outbox'
import { compressImage, getImageSize } from '../lib/image'
import { useAuth } from '../store/auth'
import type { Category, ExcelFile, Pin, Plan, Project, StorageStats, UserProfile } from '../types'

// ---------- Projects ----------

/** Proyek/denah yang sedang disimpan; selama ada, hasil refresh dari server tidak menimpa tampilan. */
const pendingProjects = new Set<string>()
const pendingPlans = new Set<string>()

export function useProjects() {
  const user = useAuth((s) => s.user)
  const key = user ? `projects:${user.id}` : null
  const q = useQuery<Project[]>(key, () => api('listProjects'), { hold: () => pendingProjects.size > 0 })
  return {
    projects: q.data ?? [],
    loading: q.loading,
    error: q.error,
    /** Proyek langsung tampil; penyimpanan ke server berjalan di belakang. */
    createProject: async (name: string) => {
      if (!user || !key) throw new Error('Not signed in')
      const id = newId()
      const draft: Project = {
        id,
        name,
        createdBy: user.id,
        memberUids: [user.id],
        createdAt: Date.now(),
        localPending: true,
      }
      pendingProjects.add(id)
      setQueryData<Project[]>(key, (prev) => [draft, ...(prev ?? [])])
      try {
        const saved = await api<Project>('createProject', { id, name })
        setQueryData<Project[]>(key, (prev) => (prev ?? []).map((p) => (p.id === id ? saved : p)))
      } catch (e) {
        setQueryData<Project[]>(key, (prev) => (prev ?? []).filter((p) => p.id !== id))
        throw e
      } finally {
        pendingProjects.delete(id)
      }
    },
    deleteProject: async (projectId: string) => {
      if (!key) return
      setQueryData<Project[]>(key, (prev) => (prev ?? []).filter((p) => p.id !== projectId))
      try {
        await api('deleteProject', { projectId })
      } catch (e) {
        invalidate(key)
        throw e
      }
    },
  }
}

// ---------- Plans ----------

export function usePlans(projectId: string | undefined) {
  const key = projectId ? `plans:${projectId}` : null
  const q = useQuery<Plan[]>(key, () => api('listPlans', { projectId }), { hold: () => pendingPlans.size > 0 })
  const patchPlan = (id: string, patch: Partial<Plan>) =>
    setQueryData<Plan[]>(key!, (prev) => (prev ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)))
  return {
    plans: q.data ?? [],
    loading: q.loading,
    error: q.error,
    /** Denah langsung tampil (dengan tanda "Mengunggah..."); unggahan ke Google Drive berjalan di belakang. */
    uploadPlan: async (name: string, file: File) => {
      if (!projectId || !key) throw new Error('Missing project')
      const id = newId()
      const draft: Plan = {
        id,
        projectId,
        name,
        imageFileId: '',
        imageURL: '',
        imageWidth: 0,
        imageHeight: 0,
        createdBy: useAuth.getState().user?.id ?? '',
        createdAt: Date.now(),
        localPending: true,
      }
      pendingPlans.add(id)
      setQueryData<Plan[]>(key, (prev) => [draft, ...(prev ?? [])])
      let preview = ''
      try {
        let source = file
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          // pdf.js cukup besar, dimuat hanya saat dibutuhkan
          const { pdfFirstPageToPng } = await import('../lib/pdf')
          const png = await pdfFirstPageToPng(file)
          source = new File([png], file.name.replace(/\.pdf$/i, '.png'), { type: 'image/png' })
        }
        const compressed = await compressImage(source, 1.5)
        const { width, height } = await getImageSize(compressed)
        preview = URL.createObjectURL(compressed)
        patchPlan(id, { imageURL: preview, imageWidth: width, imageHeight: height })
        const saved = await api<Plan>('uploadPlan', {
          id,
          projectId,
          name,
          fileName: source.name,
          mimeType: compressed.type || 'image/jpeg',
          base64: await blobToBase64(compressed),
          width,
          height,
        })
        // Tampilkan gambar lokal dulu, lalu ganti ke gambar Google Drive setelah selesai dimuat (tanpa berkedip).
        setQueryData<Plan[]>(key, (prev) =>
          (prev ?? []).map((p) => (p.id === id ? { ...saved, imageURL: preview } : p)),
        )
        setQueryData<Plan>(`plan:${projectId}:${id}`, () => saved)
        swapWhenLoaded(saved.imageURL, () => {
          patchPlan(id, { imageURL: saved.imageURL })
          setTimeout(() => URL.revokeObjectURL(preview), 5000)
        })
      } catch (e) {
        setQueryData<Plan[]>(key, (prev) => (prev ?? []).filter((p) => p.id !== id))
        if (preview) URL.revokeObjectURL(preview)
        throw e
      } finally {
        pendingPlans.delete(id)
      }
    },
    deletePlan: async (planId: string) => {
      if (!key) return
      setQueryData<Plan[]>(key, (prev) => (prev ?? []).filter((p) => p.id !== planId))
      try {
        await api('deletePlan', { projectId, planId })
      } catch (e) {
        invalidate(key)
        throw e
      }
    },
  }
}

function swapWhenLoaded(url: string, swap: () => void) {
  let done = false
  const finish = () => {
    if (!done) {
      done = true
      swap()
    }
  }
  const img = new Image()
  img.referrerPolicy = 'no-referrer'
  img.onload = finish
  img.onerror = finish
  img.src = url
  setTimeout(finish, 20000)
}

export function usePlan(projectId: string | undefined, planId: string | undefined) {
  const q = useQuery<Plan>(
    projectId && planId ? `plan:${projectId}:${planId}` : null,
    () => api('getPlan', { projectId, planId }),
    { refetchInterval: 0 },
  )
  // Pakai data dari daftar denah yang sudah dimuat, supaya denah langsung tampil.
  const fromList = projectId ? getQueryData<Plan[]>(`plans:${projectId}`)?.find((p) => p.id === planId) : undefined
  return { plan: q.data ?? fromList ?? null, error: q.data || fromList ? null : q.error }
}

// ---------- Pins ----------

export function usePins(projectId: string | undefined, planId: string | undefined) {
  const user = useAuth((s) => s.user)
  const q = useQuery<Pin[]>(
    projectId && planId ? pinsKey(projectId, planId) : null,
    () => api('listPins', { projectId, planId }),
    { refetchInterval: 20000, hold: () => !!projectId && !!planId && hasPendingFor(projectId, planId) },
  )
  const ref = (pinId: string) => {
    if (!projectId || !planId) throw new Error('Missing context')
    return { projectId, planId, pinId }
  }
  return {
    pins: q.data ?? [],
    loading: q.loading,
    createPin: async (x: number, y: number) => {
      if (!user) throw new Error('Not signed in')
      const id = newId()
      const now = Date.now()
      const pin: Pin = {
        id,
        projectId: projectId!,
        planId: planId!,
        x,
        y,
        status: 'open',
        category: 'Other',
        notes: '',
        photoFileId: '',
        photoURL: '',
        createdBy: user.id,
        createdByName: user.email,
        createdAt: now,
        updatedAt: now,
      }
      await enqueue({ kind: 'createPin', ...ref(id), pin })
      return id
    },
    updatePin: async (pinId: string, patch: Partial<Pick<Pin, 'status' | 'category' | 'notes'>>) => {
      await enqueue({ kind: 'updatePin', ...ref(pinId), patch })
    },
    deletePin: async (pinId: string) => {
      await enqueue({ kind: 'deletePin', ...ref(pinId) })
    },
    uploadPhoto: async (pinId: string, file: File) => {
      const blob = await compressImage(file, 1)
      await enqueue({
        kind: 'uploadPhoto',
        ...ref(pinId),
        blob,
        fileName: file.name,
        contentType: blob.type || 'image/jpeg',
      })
    },
  }
}

// ---------- Categories ----------

export const CATEGORY_FALLBACK_COLOR = '#6b7280'

export function useCategories() {
  const q = useQuery<Category[]>('categories', () => api('listCategories'), { refetchInterval: 120000 })
  return { categories: q.data ?? [], loading: q.loading }
}

export function categoryColor(categories: Category[], name: string) {
  return categories.find((c) => c.name === name)?.color ?? CATEGORY_FALLBACK_COLOR
}

async function mutateCategories(action: string, payload: Record<string, unknown>) {
  await api(action, payload)
  invalidate('categories')
}

export const createCategory = (name: string, color: string) => mutateCategories('createCategory', { name, color })
export const updateCategory = (categoryId: string, patch: Partial<Pick<Category, 'name' | 'color'>>) => {
  setQueryData<Category[]>('categories', (prev) =>
    (prev ?? []).map((c) => (c.id === categoryId ? { ...c, ...patch } : c)),
  )
  return mutateCategories('updateCategory', { categoryId, patch })
}
export const deleteCategory = (categoryId: string) => mutateCategories('deleteCategory', { categoryId })

// ---------- Admin ----------

export function useAdminUsers() {
  const q = useQuery<UserProfile[]>('admin:users', () => api('adminListUsers'))
  return {
    users: q.data ?? [],
    loading: q.loading,
    setUserRole: async (userId: string, role: UserProfile['role']) => {
      setQueryData<UserProfile[]>('admin:users', (prev) =>
        (prev ?? []).map((u) => (u.id === userId ? { ...u, role } : u)),
      )
      await api('adminSetUserRole', { userId, role })
    },
    deleteUser: async (userId: string) => {
      setQueryData<UserProfile[]>('admin:users', (prev) => (prev ?? []).filter((u) => u.id !== userId))
      await api('adminBanUser', { userId })
    },
  }
}

export function useAdminProjects() {
  const q = useQuery<Project[]>('admin:projects', () => api('adminListProjects'))
  return {
    projects: q.data ?? [],
    loading: q.loading,
    renameProject: async (projectId: string, name: string) => {
      setQueryData<Project[]>('admin:projects', (prev) =>
        (prev ?? []).map((p) => (p.id === projectId ? { ...p, name } : p)),
      )
      await api('adminRenameProject', { projectId, name })
      invalidate('projects:')
    },
    deleteProject: async (projectId: string) => {
      setQueryData<Project[]>('admin:projects', (prev) => (prev ?? []).filter((p) => p.id !== projectId))
      await api('adminDeleteProject', { projectId })
      invalidate('projects:')
    },
  }
}

export function useAdminPhotos() {
  const q = useQuery<Pin[]>('admin:photos', () => api('adminListPhotos'))
  return {
    pins: q.data ?? [],
    loading: q.loading,
    deletePhoto: async (pin: Pin) => {
      setQueryData<Pin[]>('admin:photos', (prev) => (prev ?? []).filter((p) => p.id !== pin.id))
      await api('adminDeletePhoto', { pinId: pin.id })
      invalidate(pinsKey(pin.projectId, pin.planId))
    },
  }
}

export function useStorageStats() {
  const q = useQuery<StorageStats>('admin:storage', () => api('adminStorageStats'), { refetchInterval: 0 })
  return { stats: q.data ?? null, loading: q.loading, error: q.error, refetch: q.refetch }
}

// ---------- Excel ----------

export function useExcelExport() {
  const [exporting, setExporting] = useState(false)
  const exportExcel = async (scope: { projectId?: string; planId?: string } = {}) => {
    setExporting(true)
    try {
      const file = await api<ExcelFile>('exportExcel', scope)
      downloadBase64(file.base64, file.fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    } finally {
      setExporting(false)
    }
  }
  return { exporting, exportExcel }
}
