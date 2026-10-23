import { useState } from 'react'
import { api, blobToBase64, downloadBase64 } from '../lib/api'
import { invalidate, setQueryData, useQuery } from '../lib/query'
import { enqueue, hasPendingFor, pinsKey } from '../lib/outbox'
import { compressImage, getImageSize } from '../lib/image'
import { useAuth } from '../store/auth'
import type { Category, ExcelFile, Pin, Plan, Project, StorageStats, UserProfile } from '../types'

// ---------- Projects ----------

export function useProjects() {
  const user = useAuth((s) => s.user)
  const q = useQuery<Project[]>(user ? `projects:${user.uid}` : null, () => api('listProjects'))
  return {
    projects: q.data ?? [],
    loading: q.loading,
    error: q.error,
    createProject: async (name: string) => {
      const project = await api<Project>('createProject', { name })
      setQueryData<Project[]>(`projects:${user!.uid}`, (prev) => [project, ...(prev ?? [])])
    },
    deleteProject: async (projectId: string) => {
      setQueryData<Project[]>(`projects:${user!.uid}`, (prev) => (prev ?? []).filter((p) => p.id !== projectId))
      await api('deleteProject', { projectId })
    },
  }
}

// ---------- Plans ----------

export function usePlans(projectId: string | undefined) {
  const key = projectId ? `plans:${projectId}` : null
  const q = useQuery<Plan[]>(key, () => api('listPlans', { projectId }))
  const [uploading, setUploading] = useState(false)
  return {
    plans: q.data ?? [],
    loading: q.loading,
    error: q.error,
    uploading,
    uploadPlan: async (name: string, file: File) => {
      if (!projectId) throw new Error('Missing project')
      setUploading(true)
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
        const plan = await api<Plan>('uploadPlan', {
          projectId,
          name,
          fileName: source.name,
          mimeType: compressed.type || 'image/jpeg',
          base64: await blobToBase64(compressed),
          width,
          height,
        })
        setQueryData<Plan[]>(key!, (prev) => [plan, ...(prev ?? [])])
        setQueryData<Plan>(`plan:${projectId}:${plan.id}`, () => plan)
      } finally {
        setUploading(false)
      }
    },
    deletePlan: async (planId: string) => {
      setQueryData<Plan[]>(key!, (prev) => (prev ?? []).filter((p) => p.id !== planId))
      await api('deletePlan', { projectId, planId })
    },
  }
}

export function usePlan(projectId: string | undefined, planId: string | undefined) {
  const q = useQuery<Plan>(
    projectId && planId ? `plan:${projectId}:${planId}` : null,
    () => api('getPlan', { projectId, planId }),
    { refetchInterval: 0 },
  )
  return { plan: q.data ?? null, error: q.error }
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
      const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20)
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
        createdBy: user.uid,
        createdByName: user.email ?? '',
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
      setQueryData<UserProfile[]>('admin:users', (prev) => (prev ?? []).map((u) => (u.id === userId ? { ...u, role } : u)))
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
