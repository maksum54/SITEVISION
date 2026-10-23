export type Role = 'admin' | 'member'
export type PinStatus = 'open' | 'in_progress' | 'done'

export interface UserProfile {
  id: string
  email: string
  displayName: string
  picture: string
  role: Role
  banned: boolean
  createdAt: number
}

export interface Project {
  id: string
  name: string
  createdBy: string
  memberUids: string[]
  createdAt: number
}

export interface Plan {
  id: string
  projectId: string
  name: string
  imageFileId: string
  imageURL: string
  imageWidth: number
  imageHeight: number
  createdBy: string
  createdAt: number
}

export interface Pin {
  id: string
  projectId: string
  planId: string
  x: number
  y: number
  status: PinStatus
  category: string
  notes: string
  photoFileId: string
  photoURL: string
  createdBy: string
  createdByName: string
  createdAt: number
  updatedAt: number
  /** Hanya di sisi klien: foto masih antre untuk diunggah ke Google Drive. */
  localPhotoPending?: boolean
  /** Hanya di sisi klien: pin belum tersimpan di server. */
  localPending?: boolean
}

export interface Category {
  id: string
  name: string
  color: string
  createdAt: number
}

export interface StorageStats {
  driveUsed: number
  driveLimit: number
  appFiles: number
  appBytes: number
  folderUrl: string
  spreadsheetUrl: string
  users: number
  projects: number
  plans: number
  pins: number
  photos: number
  lastUpdated: number
}

export interface ExcelFile {
  fileName: string
  base64: string
  rows: number
}
