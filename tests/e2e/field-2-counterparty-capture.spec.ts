import fs from 'node:fs'
import path from 'node:path'
import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

/**
 * QA-FIELD-2 — counterparty extraction across banks (standing regression assertion).
 *
 * History: filed as a capture round (counterparty empty on KTB/TTB/Paotang), then dev
 * added patterns — KTB bare `ไปยัง`, TTB positional fallback (fires only with ≥2 masks),
 * Paotang `G-Wallet ID`-section (OCR-variant tolerant). After the FIELD-2 / QA-FIELD-2a /
 * QA-FIELD-2b fixes verified GREEN at the E2E altitude, this spec became the standing guard:
 *  - transfer/merchant recipients pre-fill — KTB/TTB transfers, KBank make, Paotang
 *  - TTB & KTB *bill* payments stay EMPTY — never the SENDER (QA-FIELD-2a item 2); biller-NAME
 *    auto-fill is accepted out-of-scope (pm-desk scoping verdict 2026-06-13)
 *  - Paotang merchant survives the `G-Wallet !0:` OCR variant (QA-FIELD-2b)
 * It still writes the full OCR artifact for future pattern work.
 *
 * Capture mode: runs against `pnpm dev` — rawTextDebug is gated NODE_ENV==='development'
 * (lib/slip/extract.ts), which is what playwright.config.ts webServer drives. No slip is saved.
 */

const CORPUS = path.resolve('E:/claudeWorkSpace/qa-lab/projects/jodsa/corpus')
const OUT = path.resolve('tests/e2e/.results/field-2-ocr-capture.json')

interface Slip {
  file: string
  bank: string
  layout: string
  // Exactly one expectation per slip:
  expectContains?: string // counterparty must include this stable recipient/merchant fragment
  expectNonEmpty?: boolean // recipient must pre-fill (name is OCR-degraded → guard regression-to-empty)
  expectEmpty?: boolean // accepted known-limitation: bill/biller must NOT pre-fill a (wrong) name
}

const SLIPS: Slip[] = [
  // KTB โอนเงิน — bare `ไปยัง` label, recipient on next line
  { file: '1779533670088.jpg', bank: 'KTB', layout: 'โอนเงิน → ปราณี', expectContains: 'ปราณี' },
  { file: '1773576614931.jpg', bank: 'KTB', layout: 'โอนเงิน → ลำภู (degraded)', expectNonEmpty: true },
  { file: '1779696444712.jpg', bank: 'KTB', layout: 'โอนเงิน → self/KBank', expectNonEmpty: true },
  // KTB จ่ายบิล — biller TUNGNGERN, no name anchor → accepted empty
  { file: '1779600297906.jpg', bank: 'KTB', layout: 'จ่ายบิล TUNGNGERN (biller)', expectEmpty: true },
  // TTB โอนเงิน — positional fallback (≥2 masks → last = recipient)
  { file: 'Transfer_20260523_113038.jpg', bank: 'TTB', layout: 'โอนเงิน → self/KBank', expectNonEmpty: true },
  { file: 'Transfer_20260602_205840.jpg', bank: 'TTB', layout: 'โอนเงิน → self/KBank', expectNonEmpty: true },
  // TTB จ่ายบิล — single mask (sender only) → must NOT pre-fill the sender (QA-FIELD-2a)
  { file: 'BillPayment_20260522_132356.jpg', bank: 'TTB', layout: 'จ่ายบิล (biller — must NOT show sender)', expectEmpty: true },
  { file: 'BillPayment_20260521_115411.jpg', bank: 'TTB', layout: 'จ่ายบิล (biller — must NOT show sender)', expectEmpty: true },
  // KBank make — existing positional pattern (QA-M2-2 control)
  { file: 'Image_12b1db54-2951-4d62-8c9b-19302103cafe.jpeg', bank: 'KBank', layout: 'make → โชติสิริ', expectContains: 'โชติสิร' },
  { file: 'Image_f979ed1e-e954-45ae-a06a-ed0fece524e9.jpeg', bank: 'KBank', layout: 'make → ปราณี', expectContains: 'ปราณี' },
  // Paotang — merchant section
  { file: 'PaoTang_2026_06_02 19_54_07.png', bank: 'Paotang', layout: 'merchant รานสุก รสเดด (degraded)', expectNonEmpty: true },
  { file: 'PaoTang_2026_06_07 18_39_32.png', bank: 'Paotang', layout: 'merchant ปราณี (G-Wallet !0: variant — QA-FIELD-2b)', expectContains: 'ปราณี' },
  { file: 'PaoTang_2026_06_05 20_00_38.png', bank: 'Paotang', layout: 'merchant ร้าน ไอ้พร้าว', expectNonEmpty: true },
]

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetUserData(user.id)
  await seedAccount(user.id, 'QA-F2', 'SCB')
})

test('QA-FIELD-2 counterparty: transfers/merchants pre-fill, bills stay empty (no sender)', async ({ page }) => {
  // ~13 slips × on-device OCR, plus the first-slip tesseract model download.
  test.setTimeout(2_400_000) // 40 min ceiling; typical ~12–15 min (warm cache faster)

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

    const tag = !parsed ? '⛔ no-parse' : empty ? '·· empty ' : '✅ filled '
    console.log(`${tag} [${slip.bank}|det:${detectedBank ?? '?'}] ${slip.file} → counterparty=${counterparty || 'EMPTY'}`)
  }

  // Persist the full artifact (raw OCR text) for future pattern work.
  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2), 'utf8')

  // Console summary by bank.
  const byBank = new Map<string, { empty: number; total: number }>()
  for (const r of rows) {
    const e = byBank.get(r.bank) ?? { empty: 0, total: 0 }
    e.total++
    if (r.empty) e.empty++
    byBank.set(r.bank, e)
  }
  console.log('\n=== QA-FIELD-2 COUNTERPARTY ===')
  for (const [bank, s] of byBank) console.log(`  ${bank}: ${s.total - s.empty}/${s.total} populated (${s.empty} empty)`)
  console.log(`Artifact (with raw OCR text): ${OUT}`)

  // ── Regression assertions (artifact already written above, so a failure still leaves evidence) ──
  for (const r of rows) {
    const slip = SLIPS.find((s) => s.file === r.file)!
    expect(r.parsed, `${r.file}: import pipeline must reach the confirm form`).toBe(true)
    if (slip.expectEmpty) {
      // QA-FIELD-2a: bill payments must fall through to empty, never the sender.
      expect(r.empty, `${r.file}: bill/biller must NOT pre-fill a name (got "${r.counterparty}")`).toBe(true)
    } else if (slip.expectContains) {
      expect(r.counterparty ?? '', `${r.file}: counterparty should contain "${slip.expectContains}" (got "${r.counterparty}")`).toContain(slip.expectContains)
    } else if (slip.expectNonEmpty) {
      expect(r.empty, `${r.file}: recipient must pre-fill (got empty)`).toBe(false)
    }
  }
})
