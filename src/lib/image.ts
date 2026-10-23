import imageCompression from 'browser-image-compression'

export function compressImage(file: File, maxSizeMB: number) {
  return imageCompression(file, { maxWidthOrHeight: 1600, maxSizeMB, useWebWorker: true })
}

export function getImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = reject
    img.src = url
  })
}
