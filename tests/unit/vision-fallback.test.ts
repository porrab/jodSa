import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('client-only', () => ({}))
const mocks = vi.hoisted(() => ({ vision: vi.fn(), recognize: vi.fn(), key: vi.fn() }))
vi.mock('@/lib/slip/vision', () => ({ recognizeWithVision: mocks.vision }))
vi.mock('@/lib/slip/vision-preferences', () => ({ readVisionKey: mocks.key }))
vi.mock('tesseract.js', () => ({ createWorker: async () => ({ recognize: mocks.recognize, terminate: vi.fn() }) }))
import { parseSlipImage } from '@/lib/slip/parse-image'
beforeEach(() => {
  mocks.vision.mockReset(); mocks.key.mockReset().mockReturnValue('test-key'); mocks.recognize.mockReset().mockResolvedValue({ data: { text: 'Amount 123.45 THB' } })
  class FakeWorker {
    onmessage?: (e: { data: unknown }) => void
    postMessage() { queueMicrotask(() => this.onmessage?.({ data: { type: 'preprocessed', buffer: new ArrayBuffer(4), width: 1, height: 1, qrData: null } })) }
    terminate() {}
  }
  vi.stubGlobal('Worker', FakeWorker); vi.stubGlobal('ImageData', class {})
  vi.stubGlobal('document', { createElement: () => ({ width: 1, height: 1, getContext: () => ({ putImageData: vi.fn() }), toBlob: (callback: (blob: Blob) => void) => callback(new Blob()) }) })
})
afterEach(() => vi.unstubAllGlobals())
it.each(['403','network','timeout','empty'])('completes with Tesseract after Vision %s', async reason => {
  mocks.vision.mockRejectedValue(new Error(reason))
  const parsed = await parseSlipImage(new File(['original'], 'slip.png'), null, () => {}, { ocr: 'vision' })
  expect(mocks.recognize).toHaveBeenCalledOnce(); expect(parsed.amount.value).toBe(12345)
})
it('uses Tesseract by default even with a saved key (guest contract)', async () => {
  await parseSlipImage(new File(['original'], 'slip.png'), null, () => {})
  expect(mocks.vision).not.toHaveBeenCalled(); expect(mocks.key).not.toHaveBeenCalled()
})
it('uses Vision text without loading Tesseract when successful', async () => {
  mocks.vision.mockResolvedValue('Amount 456.78 THB')
  const result = await parseSlipImage(new File(['original'], 'slip.png'), null, () => {}, { ocr: 'vision' })
  expect(result.amount.value).toBe(45678); expect(mocks.recognize).not.toHaveBeenCalled()
})
