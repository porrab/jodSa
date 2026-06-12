import { extractFields } from '@/lib/slip/extract'
import type { ParsedSlip, WorkerResponse } from '@/lib/slip/types'

function nowBangkok(): string {
  // approximate Bangkok time (UTC+7) for default datetime
  const now = new Date(Date.now() + 7 * 3600 * 1000)
  return now.toISOString().slice(0, 16)
}

// stage keys map to i18n messages slip.stage_<stage>
export type ParseStage = 'preprocess' | 'qr' | 'ocr' | 'extract'
export type ParseProgress = { stage: ParseStage; percent: number }

/**
 * Full on-device slip pipeline: preprocess + QR in the slip worker, then OCR
 * via tesseract.js on the main thread (it spawns its own WASM worker — nesting
 * it inside slip.worker.ts breaks in Chrome/Safari). The image never leaves
 * the device; only the parsed fields are returned.
 */
export async function parseSlipImage(
  file: File,
  displayName: string | null,
  onProgress: (p: ParseProgress) => void,
): Promise<ParsedSlip> {
  const arrayBuffer = await file.arrayBuffer()

  const preprocessed = await new Promise<{
    buffer: ArrayBuffer
    width: number
    height: number
    qrData: string | null
  }>((resolve, reject) => {
    const worker = new Worker(
      new URL('../../workers/slip.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data
      if (msg.type === 'progress') {
        onProgress({ stage: msg.stage as ParseStage, percent: msg.percent })
      } else if (msg.type === 'preprocessed') {
        worker.terminate()
        resolve({ buffer: msg.buffer, width: msg.width, height: msg.height, qrData: msg.qrData })
      } else if (msg.type === 'error') {
        worker.terminate()
        reject(new Error(msg.message))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      reject(new Error(e.message))
    }
    worker.postMessage({ buffer: arrayBuffer, mimeType: file.type }, [arrayBuffer])
  })

  onProgress({ stage: 'ocr', percent: 40 })
  const { createWorker } = await import('tesseract.js')
  const tWorker = await createWorker(['tha', 'eng'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') {
        onProgress({ stage: 'ocr', percent: Math.round(40 + m.progress * 50) })
      }
    },
  })

  // tesseract.js v5 loadImage() doesn't handle ImageData — convert to Blob via canvas
  const pixelData = new Uint8ClampedArray(preprocessed.buffer)
  const imageData = new ImageData(pixelData, preprocessed.width, preprocessed.height)
  const canvas = document.createElement('canvas')
  canvas.width = preprocessed.width
  canvas.height = preprocessed.height
  canvas.getContext('2d')!.putImageData(imageData, 0, 0)
  const ocrBlob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas.toBlob failed'))), 'image/png'),
  )
  const { data: { text } } = await tWorker.recognize(ocrBlob)
  await tWorker.terminate()

  onProgress({ stage: 'extract', percent: 95 })

  const parsed = extractFields(text, preprocessed.qrData, displayName)
  if (!parsed.datetime.value) {
    parsed.datetime = { value: `${nowBangkok()}:00+07:00`, confidence: 0 }
  }
  return parsed
}
