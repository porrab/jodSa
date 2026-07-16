import { expect, type Page } from '@playwright/test'

/**
 * /invest UI helpers — drive holding creation / overview / price-update through the
 * REAL app UI (no direct DB seeding of holdings: the app must compute cost basis and
 * totals so the behavioral fixture stays honest). Mirrors the selector/helper style of
 * helpers/ui.ts. Thai UI strings (default locale) — see messages/th.json `invest`.
 */

export type AddHoldingOpts = {
  /** Unique substring of the asset picker option's visible text, e.g. '(AAPL)' or 'ทองคำแท่ง'. */
  asset: string
  /** Sleeve option label (th). Omit for the default 'core'. e.g. 'เงินเสี่ยงสูง (Risk Capital)'. */
  sleeve?: string
  qty: string
  price: string
  fees?: string
  /** 'YYYY-MM-DDTHH:mm' for the datetime-local input. */
  datetime?: string
  /** FX-at-cost rate (only used when the asset currency !== THB). */
  fx?: string
}

/** Open /invest, add one holding via the Add-Holding dialog, wait for it to close. */
export async function addHolding(page: Page, opts: AddHoldingOpts): Promise<void> {
  await page.goto('/invest')
  await page.getByRole('button', { name: 'เพิ่มสินทรัพย์' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Asset picker is the only combobox until an asset is chosen (the rest of the form
  // renders once selectedAsset is truthy).
  await dialog.getByRole('combobox').first().click()
  await page.getByRole('option', { name: opts.asset }).click()

  const form = dialog.locator('form')
  await expect(form).toBeVisible()

  if (opts.sleeve) {
    // The sleeve Select is the only combobox INSIDE the form (asset picker sits above it).
    await form.getByRole('combobox').click()
    await page.getByRole('option', { name: opts.sleeve, exact: true }).click()
  }

  await dialog.locator('#h-qty').fill(opts.qty)
  await dialog.locator('#h-price').fill(opts.price)
  if (opts.fees !== undefined) await dialog.locator('#h-fees').fill(opts.fees)
  await dialog.locator('#h-datetime').fill(opts.datetime ?? '2025-05-15T14:30')
  if (opts.fx !== undefined && (await dialog.locator('#h-fx').count())) {
    await dialog.locator('#h-fx').fill(opts.fx)
  }

  await dialog.getByRole('button', { name: 'เพิ่มสินทรัพย์' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

/** Switch to the Overview (ภาพรวม) dashboard tab, waiting for the total-value surface. */
export async function openOverview(page: Page): Promise<void> {
  await page.goto('/invest')
  await page.getByRole('button', { name: 'ภาพรวม', exact: true }).click()
}

export type CustomHoldingOpts = {
  name: string
  symbol?: string
  /** Thai asset-class label as rendered by messages/th.json `invest.assetClass.*`. */
  assetClassLabel: string
  currency: string
  qty: string
  price: string
  fees?: string
  fx?: string
  datetime?: string
}

/**
 * M5 — create a NEW custom asset via the J4 "+ create asset" exit inside the
 * Add-Holding dialog, then open a holding on it. A user-created asset always
 * lands with `proxy_class = null` (0009 backfills `is_system` rows only), which
 * is exactly how a fresh unclassified holding is seeded for the classify flow.
 */
export async function addCustomHolding(page: Page, opts: CustomHoldingOpts): Promise<void> {
  await page.goto('/invest')
  await page.getByRole('button', { name: 'เพิ่มสินทรัพย์' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  await dialog.getByRole('button', { name: /ไม่พบสินทรัพย์ที่ต้องการ/ }).click()
  const customForm = dialog.locator('form').filter({ hasText: 'สร้างสินทรัพย์ใหม่' })
  await expect(customForm).toBeVisible()

  await customForm.locator('#ca-name').fill(opts.name)
  // Two comboboxes inside the custom form: asset class first, currency second.
  await customForm.getByRole('combobox').nth(0).click()
  await page.getByRole('option', { name: opts.assetClassLabel, exact: true }).click()
  await customForm.getByRole('combobox').nth(1).click()
  await page.getByRole('option', { name: opts.currency, exact: true }).click()
  if (opts.symbol) await customForm.locator('#ca-symbol').fill(opts.symbol)

  await customForm.getByRole('button', { name: 'สร้างสินทรัพย์', exact: true }).click()
  // onCreated auto-selects the new asset → the holding form mounts.
  await expect(customForm).toBeHidden({ timeout: 30_000 })

  await dialog.locator('#h-qty').fill(opts.qty)
  await dialog.locator('#h-price').fill(opts.price)
  if (opts.fees !== undefined) await dialog.locator('#h-fees').fill(opts.fees)
  await dialog.locator('#h-datetime').fill(opts.datetime ?? '2025-05-15T14:30')
  if (opts.fx !== undefined && (await dialog.locator('#h-fx').count())) {
    await dialog.locator('#h-fx').fill(opts.fx)
  }
  await dialog.getByRole('button', { name: 'เพิ่มสินทรัพย์' }).click()
  await expect(dialog).toBeHidden({ timeout: 30_000 })
}

/** Switch to the Plan (แผนรายเดือน) tab — the M5 planner. */
export async function openPlanTab(page: Page): Promise<void> {
  await page.goto('/invest')
  await page.getByRole('button', { name: 'แผนรายเดือน', exact: true }).click()
  await expect(page.getByText('สัดส่วนเป้าหมาย')).toBeVisible()
}

/** Overwrite the 6 target-allocation inputs. Keys are AssetClass ids (input id `target-<class>`). */
export async function setTargetAllocation(
  page: Page,
  target: Record<string, number>,
): Promise<void> {
  for (const [cls, pct] of Object.entries(target)) {
    await page.locator(`#target-${cls}`).fill(String(pct))
  }
}

/**
 * Submit the plan form. Does NOT assert the outcome — callers assert the result
 * card, the `blocked` classify card, or a validation refusal themselves.
 */
export async function submitPlan(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'สร้างแผน', exact: true }).click()
}

/**
 * Open the "Update Prices" sheet, set one holding's current value (+ FX when the block
 * exposes an FX input), and save. `fx` omitted → leaves the FX field blank (exercises the
 * blank-FX exclusion path). Assumes the Overview tab is already open.
 */
export async function updatePrice(
  page: Page,
  opts: { asset: string; value: string; fx?: string },
): Promise<void> {
  await page.getByRole('button', { name: 'อัปเดตราคา' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet).toBeVisible()
  // Each holding renders in its own bordered block (space-y-2 rounded-lg border p-3),
  // value input first, FX input (foreign currency only) second.
  const block = sheet.locator('div.rounded-lg.border').filter({ hasText: opts.asset })
  await block.getByRole('textbox').first().fill(opts.value)
  if (opts.fx !== undefined) {
    await block.getByRole('textbox').nth(1).fill(opts.fx)
  }
  await sheet.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(sheet).toBeHidden({ timeout: 30_000 })
}
