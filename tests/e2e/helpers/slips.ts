import QRCode from 'qrcode'
import type { Page } from '@playwright/test'

/**
 * Synthetic Thai-bank-slip fixtures, rendered with the browser and screenshotted.
 * They exercise the import JOURNEY (QR decode → OCR → confirm → save); real-photo
 * OCR accuracy is a separate manual criterion (see qa-lab test-plan M2-S5).
 *
 * Layout constraints come from lib/slip/extract.ts + workers/slip.worker.ts:
 * - "Amount: <n>" matches AMOUNT_PATTERNS at 0.88; no thousands separator so a
 *   misread comma can never shift the decimal point
 * - "dd/MM/yyyy HH:mm" matches extractDateTime m1 + findTimeAfter
 * - QR payload is EMVCo ("000201"…) with tag 62 sub-field 05 = ref_code
 * - longest edge stays under the worker's 1600px downscale so the QR survives
 */

export function emvcoPayload(ref: string): string {
  if (!/^\w{6,30}$/.test(ref)) throw new Error(`bad ref: ${ref}`)
  const sub = `05${String(ref.length).padStart(2, '0')}${ref}`
  return `000201${`62${String(sub.length).padStart(2, '0')}${sub}`}`
}

export type SlipSpec = {
  bank: string
  datetime: string // printed as-is, e.g. "15/05/2025 14:30"
  amount: string // printed after "Amount: ", e.g. "1250.00"
  toName: string
  ref?: string // present → QR rendered with EMVCo payload
}

export async function renderSlip(page: Page, filePath: string, spec: SlipSpec): Promise<void> {
  const qrTag = spec.ref
    ? `<img alt="qr" style="display:block;margin:28px auto 0" width="260" height="260"
         src="${await QRCode.toDataURL(emvcoPayload(spec.ref), { width: 260, margin: 2 })}">`
    : ''
  await page.setViewportSize({ width: 720, height: spec.ref ? 1000 : 720 })
  await page.setContent(`
    <body style="margin:0;background:#fff">
      <div style="font-family: Arial, sans-serif; color:#111; padding:48px 56px; background:#fff">
        <div style="font-size:44px; font-weight:700; letter-spacing:1px">${spec.bank}</div>
        <div style="font-size:28px; margin-top:10px">Transfer Successful</div>
        <div style="font-size:30px; margin-top:26px">${spec.datetime}</div>
        <div style="font-size:36px; font-weight:700; margin-top:26px">Amount: ${spec.amount}</div>
        <div style="font-size:30px; margin-top:22px">To: ${spec.toName}</div>
        ${qrTag}
      </div>
    </body>`)
  await page.screenshot({ path: filePath, fullPage: true })
}
