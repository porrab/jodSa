import { test, expect, type Locator, type Page } from '@playwright/test'
import { STORAGE_A, env } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount, seedTransaction } from './helpers/admin'

/**
 * QA-SPEC5 — the rendered/pixel claims pm-desk explicitly could NOT verify
 * (SPEC-5-review.md "What was NOT verified: no browser run"). Everything here is
 * measured on painted pixels in a real browser, both themes, incl. the mobile
 * viewport the v4 brief itself flagged as unchecked:
 *   F1  light surface ladder (card↔bg L* ≥ 3.0)
 *   F2  amount-field affordance visible in BOTH themes, amount large on desktop
 *   F3  Home type ladder 36 → 16 → 14 with distinct colours (focal untouched)
 *   F4  mascot in the empty state, visible & inverted (not washed out) in dark
 *   SPEC5-4  no 12px text left on Home
 */

test.use({ storageState: STORAGE_A })

let userId: string

test.beforeEach(async () => {
  const u = await findUserByEmail(env.userA.email)
  if (!u) throw new Error(`test user A missing: ${env.userA.email}`)
  userId = u.id
  await resetAllUserData(userId)
})

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme)
  await page.reload()
  await page.waitForLoadState('networkidle')
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(isDark, `theme ${theme} applied`).toBe(theme === 'dark')
}

/** CIE Lab L* of an element's effective (nearest opaque) background, via canvas. */
async function bgLabL(el: Locator): Promise<number> {
  return el.first().evaluate((node) => {
    const paint = (color: string): [number, number, number, number] => {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      const g = c.getContext('2d')!
      g.clearRect(0, 0, 1, 1)
      g.fillStyle = 'rgba(0,0,0,0)'
      g.fillStyle = color
      g.fillRect(0, 0, 1, 1)
      const d = g.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3]]
    }
    let bg: number[] = [255, 255, 255, 255]
    let cur: Element | null = node as Element
    while (cur) {
      const p = paint(getComputedStyle(cur).backgroundColor)
      if (p[3] === 255) {
        bg = p
        break
      }
      cur = cur.parentElement
    }
    const lin = (v: number) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    const Y = 0.2126 * lin(bg[0]) + 0.7152 * lin(bg[1]) + 0.0722 * lin(bg[2])
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    return 116 * f(Y) - 16
  })
}

test('F1 — light theme has a real surface ladder: card sits ≥ 3.0 L* off the page background', async ({
  page,
}) => {
  await seedAccount(userId, 'เงินสด', 'KBank')
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await setTheme(page, 'light')

  const card = page.locator('.bg-card').first() // QuickAddCard's Card root
  await expect(card).toBeVisible()
  const cardL = await bgLabL(card)

  // Page background: the <main>/<body> backdrop the cards float on.
  const pageL = await page.locator('body').evaluate((node) => {
    const paint = (color: string) => {
      const c = document.createElement('canvas')
      c.width = c.height = 1
      const g = c.getContext('2d')!
      g.fillStyle = color
      g.fillRect(0, 0, 1, 1)
      const d = g.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3]] as number[]
    }
    let bg = [255, 255, 255, 255]
    let cur: Element | null = node as Element
    while (cur) {
      const p = paint(getComputedStyle(cur).backgroundColor)
      if (p[3] === 255) {
        bg = p
        break
      }
      cur = cur.parentElement
    }
    const lin = (v: number) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    const Y = 0.2126 * lin(bg[0]) + 0.7152 * lin(bg[1]) + 0.0722 * lin(bg[2])
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
    return 116 * f(Y) - 16
  })

  const gap = Math.abs(cardL - pageL)
  console.log(`[F1] light card L*=${cardL.toFixed(2)} page L*=${pageL.toFixed(2)} gap=${gap.toFixed(2)}`)
  expect(gap, `light card↔bg L* gap ${gap.toFixed(2)} (target ≥ 3.0)`).toBeGreaterThanOrEqual(3.0)
})

for (const theme of ['light', 'dark'] as const) {
  test(`F2 — amount field has a visible affordance in ${theme}, and the amount is large on desktop`, async ({
    page,
  }) => {
    await seedAccount(userId, 'เงินสด', 'KBank')
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await setTheme(page, theme)

    const amount = page.getByLabel('จำนวนเงิน', { exact: true }) // card amount input
    // The wrapper is the affordance (border + bg), drawn in BOTH themes.
    const wrapper = page.locator('div.rounded-md.border').filter({ has: amount })
    await expect(wrapper).toBeVisible()
    const border = await wrapper.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))
    expect(border, `amount wrapper border in ${theme}`).toBeGreaterThanOrEqual(1)

    // Desktop (default 1280 viewport ≥ md): amount must be the big focal number,
    // not the 14px the base `md:text-sm` collision produced pre-F2.
    const size = await amount.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    console.log(`[F2] ${theme} amount font-size=${size}px border=${border}px`)
    expect(size, `desktop amount font-size in ${theme}`).toBeGreaterThanOrEqual(30)
  })
}

test('F3 + SPEC5-4 — Home type ladder is 36 → 16 → 14 with distinct colours; no 12px text remains', async ({
  page,
}) => {
  const acctId = await seedAccount(userId, 'เงินสด', 'KBank')
  await seedTransaction(userId, acctId, {
    type: 'expense',
    amountSatang: 12_345,
    category: 'food',
    counterparty: 'ร้านทดสอบ QA',
    datetime: new Date().toISOString(),
  })
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  const px = (l: Locator) => l.first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const weight = (l: Locator) => l.first().evaluate((el) => getComputedStyle(el).fontWeight)
  const color = (l: Locator) => l.first().evaluate((el) => getComputedStyle(el).color)

  // Focal balance — untouched at 36px/700 (the brief forbade touching it).
  const focal = page.locator('.text-focal').first()
  expect(await px(focal), 'focal 36px').toBeCloseTo(36, 0)
  expect(await weight(focal), 'focal 700').toBe('700')

  // Section heading "รายการวันนี้ (n)" — the 16px middle tier at `foreground`,
  // no longer a caption painted muted.
  const heading = page.getByRole('heading', { name: /รายการวันนี้/ })
  expect(await px(heading), 'heading 16px').toBeCloseTo(16, 0)
  expect(await weight(heading), 'heading 600').toBe('600')
  const headingColor = await color(heading)

  // Primary row label — 16px base tier.
  const label = page.getByRole('button').filter({ hasText: 'ร้านทดสอบ QA' }).locator('p').first()
  expect(await px(label), 'row label 16px').toBeCloseTo(16, 0)

  // Secondary tier (timestamp) — 14px muted, a DISTINCT colour from the heading.
  const meta = page.getByRole('button').filter({ hasText: 'ร้านทดสอบ QA' }).locator('p.text-muted-foreground')
  expect(await px(meta), 'timestamp 14px').toBeCloseTo(14, 0)
  const metaColor = await color(meta)
  expect(metaColor, 'muted secondary colour differs from heading foreground').not.toBe(headingColor)

  // SPEC5-4 — no 12px text anywhere in the today list.
  const listFontSizes = await page
    .locator('h2:has-text("รายการวันนี้") + div, h2:has-text("รายการวันนี้")')
    .evaluateAll((nodes) => {
      const sizes = new Set<number>()
      for (const n of nodes) {
        sizes.add(parseFloat(getComputedStyle(n).fontSize))
        n.querySelectorAll('*').forEach((c) => sizes.add(parseFloat(getComputedStyle(c).fontSize)))
      }
      return [...sizes]
    })
  console.log(`[SPEC5-4] Home list font sizes: ${listFontSizes.sort((a, b) => a - b).join(', ')}px`)
  expect(listFontSizes, 'no 12px text on Home list').not.toContain(12)
})

for (const theme of ['light', 'dark'] as const) {
  test(`F4 — mascot shows in the empty state and is visible${theme === 'dark' ? ' & inverted (not washed out)' : ''} in ${theme}`, async ({
    page,
  }) => {
    // No account, no transactions → Home renders the empty-state mascot.
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await setTheme(page, theme)
    await expect(page.getByText('ยังไม่มีรายการวันนี้')).toBeVisible()

    const mascot = page.locator('img[src*="/mascot/mascot-shrug.svg"]')
    await expect(mascot).toBeVisible()
    const box = await mascot.boundingBox()
    expect(box && box.width > 0 && box.height > 0, 'mascot has rendered size').toBeTruthy()

    const filter = await mascot.evaluate((el) => getComputedStyle(el).filter)
    console.log(`[F4] ${theme} mascot filter=${filter}`)
    if (theme === 'dark') {
      // dark:invert must be active so the #141414 linework isn't lost on ~#0a0d12.
      expect(filter, 'dark mascot inverted').toContain('invert')
    } else {
      expect(filter === 'none' || filter === '', 'light mascot not inverted').toBeTruthy()
    }
  })
}

test('SPEC5-mobile — mobile viewport (390×844): FAB opens quick-add, amount affordance + empty-state mascot render, no 12px on Home', async ({
  page,
}) => {
  // A user who reaches the ＋ FAB already has an account — with zero accounts the
  // guided FirstAccountSheet auto-opens and (correctly) owns the screen, which is
  // a different journey. Seed one account; keep zero transactions so the empty
  // state still renders.
  await seedAccount(userId, 'เงินสด', 'KBank')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')

  // Empty-state mascot renders at mobile density.
  await expect(page.getByText('ยังไม่มีรายการวันนี้')).toBeVisible()
  await expect(page.locator('img[src*="/mascot/mascot-shrug.svg"]')).toBeVisible()

  // Amount affordance (card) is present with its border at mobile too.
  const amount = page.getByLabel('จำนวนเงิน', { exact: true })
  const wrapper = page.locator('div.rounded-md.border').filter({ has: amount })
  const border = await wrapper.evaluate((el) => parseFloat(getComputedStyle(el).borderTopWidth))
  expect(border, 'mobile amount wrapper border').toBeGreaterThanOrEqual(1)

  // Center FAB opens the in-place quick-add sheet (no route change).
  await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click() // nav.add
  await expect(page.getByRole('heading', { name: 'บันทึกรายการ' })).toBeVisible()

  // No 12px text on the Home shell at mobile.
  const anyTwelve = await page.locator('main').evaluate((root) => {
    let hit = false
    root.querySelectorAll('*').forEach((c) => {
      if (parseFloat(getComputedStyle(c).fontSize) === 12) hit = true
    })
    return hit
  })
  expect(anyTwelve, 'no 12px text in the Home shell at mobile').toBe(false)
})
