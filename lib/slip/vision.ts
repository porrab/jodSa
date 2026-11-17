import 'client-only'

/** Only receives the original image; never the grayscale Tesseract buffer. */
export async function recognizeWithVision(blob: Blob, key: string, signal?: AbortSignal): Promise<string> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  const timer = setTimeout(abort, 15000)
  let status: number | undefined
  try {
    if (!key) throw new Error()
    const bitmap = await createImageBitmap(blob)
    let content: string
    try {
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d'); if (!context) throw new Error()
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      content = canvas.toDataURL('image/jpeg', 0.9).split(',')[1]
    } finally { bitmap.close() }
    const response = await fetch('https://vision.googleapis.com/v1/images:annotate', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({ requests: [{ image: { content }, features: [{ type: 'TEXT_DETECTION' }], imageContext: { languageHints: ['th','en'] } }] }),
      signal: controller.signal,
    })
    status = response.status
    if (!response.ok) throw new Error()
    const data = await response.json() as { responses?: { error?: unknown; fullTextAnnotation?: { text?: string }; textAnnotations?: { description?: string }[] }[] }
    const result = data.responses?.[0]
    const text = result?.fullTextAnnotation?.text || result?.textAnnotations?.[0]?.description
    if (result?.error || !text?.trim()) throw new Error()
    return text
  } catch { throw new Error(status === undefined ? 'Vision unavailable' : `Vision status ${status}`) }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', abort) }
}
