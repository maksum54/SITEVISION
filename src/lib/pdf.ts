import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export function isPdf(file: File) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/** Render halaman pertama PDF menjadi gambar PNG. */
export async function pdfFirstPageToPng(file: File, maxSize = 2000): Promise<Blob> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const page = await doc.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: maxSize / Math.max(base.width, base.height) })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Tidak bisa membuat canvas untuk render PDF')
  await page.render({ canvasContext: ctx, canvas, viewport, intent: 'print' }).promise
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Gagal mengonversi halaman PDF menjadi gambar')
  return blob
}
