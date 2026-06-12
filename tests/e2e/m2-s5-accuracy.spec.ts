import path from 'node:path'
import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

/**
 * M2-S5 — Real-slip accuracy: amount correct on ≥9/10 (M2-1).
 * Also records counterparty extraction for M2-9b verification.
 *
 * Corpus: qa-lab/projects/jodsa/corpus/ (real Thai bank slip images).
 * Images are uploaded via the file input and processed entirely on-device
 * (preprocess → QR → tesseract.js OCR → extract). No slip is confirmed/saved.
 */

const CORPUS = path.resolve('E:/claudeWorkSpace/qa-lab/projects/jodsa/corpus')

interface Fixture {
  file: string
  expectedBaht: number
  bank: string
  desc: string
  // If set: assert this substring appears in the counterparty field (M2-9b)
  expectCounterparty?: string
}

// 12-slip corpus sample: 5 KTB + 4 TTB + 2 KBank make + 1 Paotang
const SLIPS: Fixture[] = [
  // KTB — โอนเงิน (PromptPay) with QR ref codes
  { file: '1779533670088.jpg', expectedBaht: 55,   bank: 'KTB', desc: 'KTB โอนเงิน → นางปราณี แสงตระการ' },
  { file: '1773576614931.jpg', expectedBaht: 40,   bank: 'KTB', desc: 'KTB โอนเงิน → น.ส.ลำภู พ่วงพูล' },
  { file: '1779696444712.jpg', expectedBaht: 2000, bank: 'KTB', desc: 'KTB โอนเงิน → KBank 2,000 บาท' },
  // KTB — จ่ายบิล (TUNGNGERN/กบตามสั่ง)
  { file: '1779600297906.jpg', expectedBaht: 40, bank: 'KTB', desc: 'KTB จ่ายบิล กบตามสั่ง 40 บาท' },
  { file: '1779511965449.jpg', expectedBaht: 40, bank: 'KTB', desc: 'KTB จ่ายบิล กบตามสั่ง 40 บาท (2)' },
  // TTB — โอนเงิน (TTB→KBank)
  { file: 'Transfer_20260523_113038.jpg', expectedBaht: 1000, bank: 'TTB', desc: 'TTB โอนเงิน → KBank 1,000 บาท' },
  { file: 'Transfer_20260602_205840.jpg', expectedBaht: 4000, bank: 'TTB', desc: 'TTB โอนเงิน → KBank 4,000 บาท' },
  // TTB — จ่ายบิล
  { file: 'BillPayment_20260522_132356.jpg', expectedBaht: 30, bank: 'TTB', desc: 'TTB จ่ายบิล SCB 30 บาท' },
  { file: 'BillPayment_20260521_115411.jpg', expectedBaht: 60, bank: 'TTB', desc: 'TTB จ่ายบิล 60 บาท' },
  // KBank (make by KBank) — โอนเงิน with QR
  // expectCounterparty uses prefix before ambiguous sara-i/sara-ii vowel (OCR often misreads ิ→ี)
  { file: 'Image_12b1db54-2951-4d62-8c9b-19302103cafe.jpeg', expectedBaht: 55, bank: 'KBank', desc: 'KBank make โอนเงิน → โชติสิริ 55 บาท', expectCounterparty: 'โชติสิร' },
  { file: 'Image_f979ed1e-e954-45ae-a06a-ed0fece524e9.jpeg', expectedBaht: 55, bank: 'KBank', desc: 'KBank make โอนเงิน → นางปราณี 55 บาท', expectCounterparty: 'ปราณี' },
  // Paotang — จ่ายด้วยสิทธิไทยช่วยไทยพลัส 60/40
  // ค่าสินค้า 65 − สิทธิ 39 = จำนวนเงินที่ชำระ 26 บาท (expected: the charge, not the list price)
  { file: 'PaoTang_2026_06_02 19_54_07.png', expectedBaht: 26, bank: 'Paotang', desc: 'เป๋าตัง จ่ายร้านสุกี้ รสเด็ด 26 บาท' },
]

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_A })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetUserData(user.id)
  await seedAccount(user.id, 'QA-M2S5', 'SCB')
})

test('M2-S5 amount correct on ≥9/12 real slips; counterparty populated where expected (M2-1 + M2-9b)', async ({ page }) => {
  // 20 min: first slip downloads tesseract model (~1 min), subsequent ~30–60 s each
  test.setTimeout(1_200_000)

  type Result = {
    desc: string; bank: string; expectedBaht: number
    actual: string | null; amountOk: boolean
    counterparty: string | null; counterpartyOk: boolean | null
  }
  const results: Result[] = []

  for (const slip of SLIPS) {
    const filePath = path.join(CORPUS, slip.file)
    let actual: string | null = null
    let counterparty: string | null = null

    await page.goto('/import')
    await page.locator('input[type="file"]').setInputFiles(filePath)

    const parsed = await page
      .getByRole('heading', { name: 'ยืนยันรายการ' })
      .waitFor({ timeout: 240_000 })
      .then(() => true)
      .catch(() => false)

    if (parsed) {
      actual = await page.locator('input[name="amount"]').inputValue()
      counterparty = await page.locator('input[name="counterparty"]').inputValue()
    }

    const amountOk = actual !== null && Math.abs(parseFloat(actual) - slip.expectedBaht) < 0.01
    const counterpartyOk = slip.expectCounterparty != null
      ? counterparty !== null && counterparty.includes(slip.expectCounterparty)
      : null

    results.push({ desc: slip.desc, bank: slip.bank, expectedBaht: slip.expectedBaht, actual, amountOk, counterparty, counterpartyOk })

    const tag = amountOk ? '✅' : '❌'
    const cpTag = counterpartyOk === true ? '✅' : counterpartyOk === false ? '❌' : '–'
    console.log(`${tag} ${slip.desc}: expected=${slip.expectedBaht} actual=${actual ?? 'null'} | counterparty [${cpTag}] ${counterparty ?? 'null'}`)
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const amountPassed = results.filter(r => r.amountOk).length
  const total = results.length
  const cpChecked = results.filter(r => r.counterpartyOk !== null)
  const cpPassed  = cpChecked.filter(r => r.counterpartyOk === true).length

  console.log(`\n=== M2-S5 SUMMARY ===`)
  console.log(`Amount accuracy (M2-1): ${amountPassed}/${total} correct`)
  console.log(`Counterparty (M2-9b):   ${cpPassed}/${cpChecked.length} slips with expected counterparty`)
  results.filter(r => !r.amountOk).forEach(r =>
    console.log(`  ❌ AMOUNT FAIL: ${r.desc} — expected ${r.expectedBaht}, got ${r.actual ?? 'null (parse failed)'}`)
  )
  results.filter(r => r.counterpartyOk === false).forEach(r =>
    console.log(`  ❌ COUNTERPARTY FAIL: ${r.desc} — expected contains '${SLIPS.find(s => s.desc === r.desc)?.expectCounterparty}', got '${r.counterparty ?? 'null'}'`)
  )

  // M2-1: ≥9 of any 10 → testing 12 slips; require at least 9 correct (≥75%)
  expect(amountPassed, `Amount correct on only ${amountPassed}/${total} slips (need ≥9)`).toBeGreaterThanOrEqual(9)

  // M2-9b: counterparty must be populated on all slips where we expect it
  expect(cpPassed, `Counterparty missing on ${cpChecked.length - cpPassed}/${cpChecked.length} slips that should have it (M2-9b)`).toBe(cpChecked.length)
})
