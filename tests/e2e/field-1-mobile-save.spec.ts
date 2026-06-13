import path from 'node:path'
import { test, expect, type Page, type Locator } from '@playwright/test'
import { env, STORAGE_A, GENERATED_DIR } from './helpers/env'
import { findUserByEmail, resetUserData, seedAccount } from './helpers/admin'

/**
 * QA-FIELD-1 — regression guard: the slip-confirm Save button must stay fully
 * tappable on a phone, never occluded by the fixed mobile bottom nav.
 *
 * Bug (REVIEW-INBOX [FIELD] 2026-06-13): on a mobile viewport, a readable-QR
 * slip renders the extra read-only "Ref (จาก QR)" field (slip-confirm-form.tsx
 * :287-292). Its height pushed the w-full submit button (the form's last element,
 * :304) into the bottom strip overlaid by the `fixed bottom-0 z-50 … md:hidden`
 * nav (app-nav.tsx:53) — and because the nav is `fixed`, scrolling can't free it.
 * Non-QR slips are shorter, so their button cleared the nav. Fix: pb-24 md:pb-6 on
 * the scroll containers (app/(app)/layout.tsx:14, app/import/page.tsx:24).
 *
 * This replaces a one-off phone screenshot with a standing assertion: the Save
 * button's bounding box must not intersect the fixed nav's, and the end-to-end
 * save must complete. A non-QR control (shorter form, no Ref field) pins that the
 * regression is specifically the QR-only height delta.
 *
 * Runs on the live on-device pipeline (QR decode → tesseract.js OCR), hence the
 * long timeouts.
 */

const SLIP_QR = path.join(GENERATED_DIR, 'slip-qr-a.png') // SCB, ฿1250.00, readable QR → Ref field
const SLIP_NOQR = path.join(GENERATED_DIR, 'slip-noqr.png') // KBank, ฿777.25, no QR → no Ref field

const PHONE = { width: 390, height: 844 } // iPhone 12/13/14 logical viewport

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_A, viewport: PHONE })

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user missing: ${env.userA.email}`)
  await resetUserData(user.id)
  // Two accounts so the FIELD-3 bonus observation is meaningful: accounts[0] is
  // NOT the slip's bank, so a bank-matched auto-select can't be mistaken for the
  // [0] default. Order matters — seedAccount stamps created_at; /import orders by it.
  await seedAccount(user.id, 'QA-F1 Krung', 'KTB') // accounts[0] — does NOT match the slip bank
  await seedAccount(user.id, 'QA-F1 Siam', 'SCB') // matches slip-qr-a's SCB header
})

const confirmButton = (page: Page) => page.getByRole('button', { name: 'ยืนยันและบันทึก' })
// The mobile bottom nav is the only <nav> carrying Tailwind `fixed`; the desktop
// sidebar nav (inside an aside.hidden.md:flex) has no `fixed` and is display:none here.
const mobileNav = (page: Page) => page.locator('nav.fixed')

async function importSlip(page: Page, fixture: string): Promise<void> {
  await page.goto('/import')
  await page.locator('input[type="file"]').setInputFiles(fixture)
  // preprocess → QR → OCR (model download on cold cache) → extract → confirm form
  await expect(page.getByRole('heading', { name: 'ยืนยันรายการ' })).toBeVisible({ timeout: 240_000 })
}

type Box = { x: number; y: number; width: number; height: number }
function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** The core regression assertion: the submit button clears the fixed mobile nav. */
async function assertButtonClearsNav(page: Page, button: Locator): Promise<void> {
  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeVisible()
  await expect(button).toBeEnabled()
  const nav = mobileNav(page)
  await expect(nav).toBeVisible() // sanity: we really are on the mobile layout

  const btnBox = await button.boundingBox()
  const navBox = await nav.boundingBox()
  expect(btnBox, 'submit button must have a layout box').not.toBeNull()
  expect(navBox, 'fixed mobile nav must have a layout box').not.toBeNull()

  // Button sits within the visible viewport (not scrolled off the top/bottom).
  expect(btnBox!.y).toBeGreaterThanOrEqual(0)
  expect(btnBox!.y + btnBox!.height).toBeLessThanOrEqual(PHONE.height + 0.5)

  // The actual regression check: the button must NOT overlap the fixed bottom nav.
  expect(
    intersects(btnBox!, navBox!),
    `Save button [y ${btnBox!.y.toFixed(0)}–${(btnBox!.y + btnBox!.height).toFixed(0)}] overlaps ` +
      `the fixed nav [y ${navBox!.y.toFixed(0)}–${(navBox!.y + navBox!.height).toFixed(0)}] ` +
      `(viewport ${PHONE.width}×${PHONE.height})`,
  ).toBe(false)
}

test('QA-FIELD-1 readable-QR slip: Save button clears the mobile nav and saves end-to-end', async ({ page }) => {
  test.setTimeout(360_000)
  await importSlip(page, SLIP_QR)

  // The QR path renders the extra read-only Ref field — the height that triggered the bug.
  await expect(page.getByText('Ref (จาก QR)')).toBeVisible()

  // FIELD-3 bonus (already pm-desk-APPROVED): account auto-selected by the slip's
  // detected bank (SCB), not the accounts[0] default (KTB). Logged as evidence, not
  // asserted — keeps this nav-occlusion guard from depending on bank-name OCR.
  const acctText = (await page.getByRole('combobox').nth(1).textContent())?.trim()
  console.log(`[FIELD-3 bonus] slip bank=SCB → auto-selected account: ${acctText ?? '(unread)'}`)

  const button = confirmButton(page)
  await assertButtonClearsNav(page, button)

  // End-to-end proof: the click genuinely lands (Playwright's actionability check
  // would throw if the fixed nav intercepted the pointer) and the transaction saves.
  await button.click()
  await page.waitForURL('**/transactions', { timeout: 30_000 })
  await expect(page.getByText('฿1,250.00').first()).toBeVisible()
})

test('QA-FIELD-1 non-QR control: shorter form (no Ref field) also clears the nav', async ({ page }) => {
  test.setTimeout(360_000)
  await importSlip(page, SLIP_NOQR)

  await expect(page.getByText('Ref (จาก QR)')).toHaveCount(0) // no QR → no Ref field → shorter form
  await assertButtonClearsNav(page, confirmButton(page))
})
