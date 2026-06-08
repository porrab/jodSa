// NOTE: tesseract.js is NOT loaded here. It runs from the main thread via
// dynamic import() in import-client.tsx. Reason: tesseract.js v5 internally
// spawns its own WASM worker; loading it inside this Web Worker creates a
// nested worker that breaks in Chrome/Safari. OCR still runs off the main
// render thread because tesseract.js delegates to its own internal worker.
// Do NOT move tesseract.js into this file.
import jsQR from 'jsqr'
import type { WorkerParseMessage, WorkerResponse } from '@/lib/slip/types'

function post(msg: WorkerResponse, transfer?: Transferable[]) {
  self.postMessage(msg, transfer ? { transfer } : undefined)
}

self.addEventListener('message', async (e: MessageEvent<WorkerParseMessage>) => {
  const { buffer, mimeType } = e.data

  try {
    post({ type: 'progress', stage: 'preprocess', percent: 5 })

    const blob = new Blob([buffer], { type: mimeType })
    const bitmap = await createImageBitmap(blob)

    // Downscale longest edge to 1600px for faster OCR without losing readability
    const MAX = 1600
    let w = bitmap.width
    let h = bitmap.height
    if (Math.max(w, h) > MAX) {
      const scale = MAX / Math.max(w, h)
      w = Math.round(w * scale)
      h = Math.round(h * scale)
    }

    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const imageData = ctx.getImageData(0, 0, w, h)

    // QR decode on color pixels (before grayscale conversion)
    post({ type: 'progress', stage: 'qr', percent: 20 })
    const qrResult = jsQR(imageData.data, w, h)
    const qrData = qrResult?.data ?? null

    // Grayscale + contrast boost for better OCR accuracy
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const v = Math.min(255, Math.max(0, (gray - 128) * 1.4 + 128))
      d[i] = d[i + 1] = d[i + 2] = v
      // alpha unchanged
    }

    post(
      { type: 'preprocessed', buffer: imageData.data.buffer, width: w, height: h, qrData },
      [imageData.data.buffer],
    )
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
})
