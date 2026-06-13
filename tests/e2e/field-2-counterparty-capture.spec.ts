import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

/**
 * QA-FIELD-2 — diagnostic CAPTURE (not a pass/fail gate yet).
 *
 * Bug (REVIEW-INBOX [FIELD] 2026-06-13): the confirm form's recipient/sender
 * field is empty for some banks because extractCounterparty (lib/slip/extract.ts
 * :129) only matches a name preceded by a recognized label (or the one K+
 * positional pattern). Dev landed part 1 (normalizeThaiDigits parity); parts 2-3
 * (bank-specific pattern + a real-string unit test) are BLOCKED on the failing
 * slip's raw OCR text.
 *
 * This spec runs a cross-bank corpus sample through the on-device pipeline and
 * records, per slip: the detected bank, the counterparty the form pre-filled (or
 * EMPTY), and the raw OCR text. The artifact at .results/field-2-ocr-capture.json
 * is what dev needs to author the COUNTERPARTY_PATTERNS entry + real-string test.
 * No slip is saved.
 *
 * CAPTURE MODE — important: the OCR debug text (slip.rawTextDebug) is gated to
 * `process.env.NODE_ENV === 'development'` (extract.ts:238), so it is present only
 * under `next dev` — which is exactly what playwright.config.ts webServer runs.
 * The brief's "next build && next start" instruction is wrong here: `next start`
 * is NODE_ENV=production and would HIDE the panel. The dev server is the correct
 * capture mode.
 *
 * Once dev adds the pattern, this becomes the FIELD-2 regression assertion (the
 * previously-empty bank's recipient name must pre-fill).
 */

const CORPUS = path.resolve('E:/claudeWorkSpace/qa-lab/projects/jodsa/corpus')
const OUT = path.resolve('tests/e2e/.results/field-2-ocr-capture.json')

interface Slip {
  file: string
  bank: string // a-priori label (corpus filename family); detectedBank is captured separately
  layout: string
}

// Cross-bank sample spanning every family in the corpus, weighted toward
// transfer/payment slips that DO show a recipient/merchant name — the cases a
// missing counterparty actually hurts. Counterparty is captured, not asserted.
const SLIPS: Slip[] = [
  // KTB — โอนเงิน (PromptPay), recipient name visible
  { file: '1779533670088.jpg', bank: 'KTB', layout: 'โอนเงิน → นางปราณี แสงตระการ' },
  { file: '1773576614931.jpg', bank: 'KTB', layout: 'โอนเงิน → น.ส.ลำภู พ่วงพูล' },
  { file: '1779696444712.jpg', bank: 'KTB', layout: 'โอนเงิน → KBank' },
  // KTB — จ่ายบิล (biller name)
  { file: '1779600297906.jpg', bank: 'KTB', layout: 'จ่ายบิล กบตามสั่ง' },
  // TTB — โอนเงิน
  { file: 'Transfer_20260523_113038.jpg', bank: 'TTB', layout: 'โอนเงิน → KBank' },
  { file: 'Transfer_20260602_205840.jpg', bank: 'TTB', layout: 'โอนเงิน → KBank' },
  // TTB — จ่ายบิล
  { file: 'BillPayment_20260522_132356.jpg', bank: 'TTB', layout: 'จ่ายบิล SCB' },
  { file: 'BillPayment_20260521_115411.jpg', bank: 'TTB', layout: 'จ่ายบิล' },
  // KBank make (K+) — the QA-M2-2 positional-pattern targets (should now populate; control)
  { file: 'Image_12b1db54-2951-4d62-8c9b-19302103cafe.jpeg', bank: 'KBank', layout: 'make โอนเงิน → โชติสิริ' },
  { file: 'Image_f979ed1e-e954-45ae-a06a-ed0fece524e9.jpeg', bank: 'KBank', layout: 'make โอนเงิน → ปราณี' },
  // Paotang (เป๋าตัง) — wallet / merchant payments
  { file: 'PaoTang_2026_06_02 19_54_07.png', bank: 'Paotang', layout: 'จ่ายร้านสุกี้ รสเด็ด' },
  { file: 'PaoTang_2026_06_07 18_39_32.png', bank: 'Paotang', layout: 'wallet payment' },
  { file: 'PaoTang_2026_06_05 20_00_38.png', bank: 'Paotang', layout: 'wallet payment' },
]

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetUserData(user.id)
  await seedAccount(user.id, 'QA-F2', 'SCB')
})

test('QA-FIELD-2 capture: counterparty + raw OCR text across banks', async ({ page }) => {
  // ~13 slips × on-device OCR, plus the first-slip tesseract model download.
  test.setTimeout(2_400_000) // 40 min ceiling; typical ~12–15 min

  type Row = {
    file: string
    bank: string
    layout: string
    parsed: boolean
    counterparty: string | null
    empty: boolean
    detectedBank: string | null
    amount: string | null
    rawText: string | null
  }
  const rows: Row[] = []

  for (const slip of SLIPS) {
    const filePath = path.join(CORPUS, slip.file)
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  MISSING FILE: ${slip.file}`)
      rows.push({ ...slip, parsed: false, counterparty: null, empty: true, detectedBank: null, amount: null, rawText: null })
      continue
    }

    await page.goto('/import')
    await page.locator('input[type="file"]').setInputFiles(filePath)

    const parsed = await page
      .getByRole('heading', { name: 'ยืนยันรายการ' })
      .waitFor({ timeout: 240_000 })
      .then(() => true)
      .catch(() => false)

    let counterparty: string | null = null
    let detectedBank: string | null = null
    let amount: string | null = null
    let rawText: string | null = null

    if (parsed) {
      counterparty = await page.locator('input[name="counterparty"]').inputValue()
      amount = await page.locator('input[name="amount"]').inputValue()
      const bankField = page.locator('input[name="bank_code"]')
      detectedBank = (await bankField.count()) > 0 ? await bankField.inputValue() : null
      // OCR debug panel is dev-only; read its <pre> even while the <details> is collapsed.
      const dbg = page.locator('details', { has: page.getByText('OCR debug') }).locator('pre')
      if ((await dbg.count()) > 0) rawText = (await dbg.first().textContent())?.trim() ?? null
    }

    const empty = !counterparty || counterparty.trim().length === 0
    rows.push({
      file: slip.file,
      bank: slip.bank,
      layout: slip.layout,
      parsed,
      counterparty: counterparty || null,
      empty,
      detectedBank,
      amount,
      rawText,
    })

    const tag = !parsed ? '⛔ no-parse' : empty ? '❌ EMPTY ' : '✅ filled '
    console.log(`${tag} [${slip.bank}|det:${detectedBank ?? '?'}] ${slip.file} → counterparty=${counterparty || 'EMPTY'}`)
  }

  // Persist the full artifact (raw OCR text included) for the QA-FIELD-2 bug brief.
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2), 'utf8')

  // Console summary grouped by a-priori bank label.
  const byBank = new Map<string, { empty: number; total: number }>()
  for (const r of rows) {
    const e = byBank.get(r.bank) ?? { empty: 0, total: 0 }
    e.total++
    if (r.empty) e.empty++
    byBank.set(r.bank, e)
  }
  console.log('\n=== QA-FIELD-2 COUNTERPARTY CAPTURE ===')
  for (const [bank, s] of byBank) console.log(`  ${bank}: ${s.total - s.empty}/${s.total} populated (${s.empty} empty)`)
  console.log(`Artifact (with raw OCR text): ${OUT}`)

  // Capture-only: assert the pipeline actually ran. Nothing is asserted about
  // counterparty — that's the data dev needs, and the gate comes in the re-test round.
  expect(rows.some((r) => r.parsed), 'at least one slip must parse for the capture to be meaningful').toBe(true)
})
