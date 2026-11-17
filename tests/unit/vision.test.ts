import { afterEach, expect, it, vi } from 'vitest'
vi.mock('client-only', () => ({}))
import { recognizeWithVision } from '@/lib/slip/vision'
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
function browser() {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 1000, close: vi.fn() }))
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), toDataURL: () => 'data:image/jpeg;base64,YWJj' }
  vi.stubGlobal('document', { createElement: () => canvas })
  return canvas
}
it.each([{ fullTextAnnotation: { text: 'ภาษาไทย' } }, { textAnnotations: [{ description: 'ภาษาไทย' }] }])('maps Vision text and sends a downscaled original JPEG with header-only key', async response => {
  const canvas = browser(); const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ responses: [response] }) }); vi.stubGlobal('fetch', fetcher)
  expect(await recognizeWithVision(new Blob(['original']), 'private-key')).toBe('ภาษาไทย')
  expect(canvas.width).toBe(2000); expect(canvas.height).toBe(500)
  const [url, options] = fetcher.mock.calls[0]; expect(url).not.toContain('private-key'); expect(options.headers['X-Goog-Api-Key']).toBe('private-key')
  expect(JSON.parse(options.body).requests[0]).toMatchObject({ image: { content: 'YWJj' }, features: [{ type: 'TEXT_DETECTION' }], imageContext: { languageHints: ['th','en'] } })
})
it.each(['http','network','empty'])('never exposes the key on %s errors', async mode => {
  browser(); vi.stubGlobal('fetch', mode === 'network' ? vi.fn().mockRejectedValue(new Error('private-key')) : vi.fn().mockResolvedValue({ ok: mode !== 'http', status: 403, json: async () => ({ responses: [{}] }) }))
  await expect(recognizeWithVision(new Blob(), 'private-key')).rejects.not.toThrow('private-key')
})
it('aborts a stalled request after 15 seconds without exposing the key', async () => {
  browser(); vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private-key'))))))
  const result = expect(recognizeWithVision(new Blob(), 'private-key')).rejects.toThrow('Vision unavailable')
  await vi.advanceTimersByTimeAsync(15000); await result
})
