import { test, expect, type Locator, type Page } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount, seedBudget, seedTransaction } from './helpers/admin'

/**
 * QA-M9 — Contrast audit (design v3 floor + ceiling), production build.
 *
 * The rendered-pixel gate pm-desk routed here (deviation (a): no per-screen
 * contrast audit at code+unit). Samples key text surfaces in BOTH themes and
 * checks the v3 rules on the ACTUAL painted colors:
 *   - floor: body & muted text ≥ 4.5:1 (WCAG AA) on their real surface.
 *   - ceiling (dark): body text ≤ ~13:1 — NOT the near-pure-white glare that
 *     caused the reported eye strain; near-white (~0.97 L) is reserved for the
 *     single focal number via `.text-focal`.
 *   - no backdrop-blur behind content text (the txn day-header).
 *
 * Method: colors are resolved to sRGB by painting the computed color string onto
 * a 1x1 canvas (so oklch() tokens resolve exactly as rendered), then WCAG
 * relative-luminance contrast is computed against the nearest opaque ancestor
 * background. No extra dev-dependency added.
 *
 * Coverage (honest): 2 screens (Home, Transactions) × 2 themes × text roles
 * {focal number, body text on card, muted-on-card}. Not every screen is sampled;
 * the tokens are systemic (all cards/text derive from the same CSS variables), so
 * these representative surfaces exercise the token values that every screen uses.
 */

test.use({ storageState: STORAGE_A })

// WCAG contrast saturates near white (0.89 L body and 0.97 L focal both land
// ~13–15:1 on the 0.17 L dark background), so a ratio ceiling alone can't tell
// "toned-down body" from "reserved near-white focal". DARK_CEIL catches a
// pure-white (#fff) body regression (~16:1 on this bg); BODY_LUM_MAX is the real
// v3 ceiling discriminator — body must be perceptibly below the near-white the
// focal number reserves.
const DARK_CEIL = 16.0
const BODY_LUM_MAX = 0.80
const AA = 4.5

let userId: string

test.beforeAll(async () => {
  const u = await findUserByEmail(env.userA.email)
  if (!u) throw new Error(`test user A missing: ${env.userA.email}`)
  userId = u.id
  await resetAllUserData(userId)
  const acct = await seedAccount(userId, 'เงินสด', 'KBank')
  await seedBudget(userId, 1_000_000)
  await seedTransaction(userId, acct, { type: 'expense', amountSatang: 12_345, category: 'food', counterparty: 'ร้านตัวอย่าง คอนทราสต์' })
})

type Sample = { ratio: number; fg: string; bg: string; fgLum: number }

// Resolve painted sRGB via canvas (handles oklch/rgb/hsl), compute WCAG contrast
// against the nearest opaque ancestor background.
async function contrastOf(el: Locator): Promise<Sample> {
  return el.first().evaluate((node) => {
    const paint = (color: string): [number, number, number, number] => {
      const c = document.createElement('canvas'); c.width = c.height = 1
      const g = c.getContext('2d')!
      g.clearRect(0, 0, 1, 1)
      g.fillStyle = 'rgba(0,0,0,0)'; g.fillStyle = color
      g.fillRect(0, 0, 1, 1)
      const d = g.getImageData(0, 0, 1, 1).data
      return [d[0], d[1], d[2], d[3]]
    }
    const rel = ([r, gg, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
      return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b)
    }
    const fg = paint(getComputedStyle(node as Element).color)
    // Walk ancestors to the first opaque background color.
    let bg: number[] = [255, 255, 255, 255]
    let cur: Element | null = node as Element
    while (cur) {
      const p = paint(getComputedStyle(cur).backgroundColor)
      if (p[3] === 255) { bg = p; break }
      cur = cur.parentElement
    }
    const L1 = rel(fg), L2 = rel(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    const hex = (a: number[]) => '#' + a.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('')
    return { ratio: Math.round(ratio * 100) / 100, fg: hex(fg), bg: hex(bg), fgLum: Math.round(rel(fg) * 1000) / 1000 }
  })
}

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate((t) => localStorage.setItem('theme', t), theme)
  await page.reload()
  await page.waitForLoadState('networkidle')
  const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
  expect(isDark, `theme ${theme} applied`).toBe(theme === 'dark')
}

for (const theme of ['light', 'dark'] as const) {
  test(`M9-contrast Home (${theme}): focal, muted-on-card meet floor${theme === 'dark' ? ' + ceiling' : ''}`, async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')
    await setTheme(page, theme)

    // Muted label ("ยอดรวมทุกบัญชี") — muted-foreground floor.
    const muted = await contrastOf(page.getByText('ยอดรวมทุกบัญชี', { exact: true }))
    console.log(`[contrast] Home muted (${theme}) ratio=${muted.ratio} fg=${muted.fg} bg=${muted.bg}`)
    expect(muted.ratio, `Home muted (${theme}) fg=${muted.fg} bg=${muted.bg}`).toBeGreaterThanOrEqual(AA)

    // Focal balance (.text-focal) — the reserved near-white; floor only (allowed
    // to exceed the body ceiling by design). Logged to show it IS brighter than body.
    const focal = await contrastOf(page.locator('.text-focal').first())
    console.log(`[contrast] Home focal (${theme}) ratio=${focal.ratio} fg=${focal.fg} bg=${focal.bg} lum=${focal.fgLum}`)
    expect(focal.ratio, `Home focal (${theme}) fg=${focal.fg} bg=${focal.bg}`).toBeGreaterThanOrEqual(AA)

    // The one-line budget status is muted body text — floor + (dark) ceiling.
    const budgetLine = await contrastOf(page.getByText('เดือนนี้ใช้ไป', { exact: false }))
    expect(budgetLine.ratio, `Home budget-line (${theme}) fg=${budgetLine.fg}`).toBeGreaterThanOrEqual(AA)
    if (theme === 'dark') {
      expect(budgetLine.ratio, `Home budget-line ceiling (dark) fg=${budgetLine.fg}`).toBeLessThanOrEqual(DARK_CEIL)
    }
  })

  test(`M9-contrast Transactions (${theme}): body + muted-on-card meet floor${theme === 'dark' ? ' + body ceiling' : ''}, no blur under day-header`, async ({ page }) => {
    await page.goto('/transactions')
    await page.waitForLoadState('networkidle')
    await setTheme(page, theme)

    // Body text (the counterparty line) — floor + (dark) ceiling: body must be
    // toned down, not the near-white glare reserved for the focal number.
    const body = await contrastOf(page.getByText('ร้านตัวอย่าง คอนทราสต์'))
    console.log(`[contrast] Txn body   (${theme}) ratio=${body.ratio} fg=${body.fg} bg=${body.bg} lum=${body.fgLum}`)
    expect(body.ratio, `Txn body (${theme}) fg=${body.fg} bg=${body.bg}`).toBeGreaterThanOrEqual(AA)
    if (theme === 'dark') {
      expect(body.ratio, `Txn body ceiling (dark) fg=${body.fg} lum=${body.fgLum}`).toBeLessThanOrEqual(DARK_CEIL)
      expect(body.fgLum, `Txn body not near-white (dark) fg=${body.fg}`).toBeLessThan(BODY_LUM_MAX)
      expect(body.fg, 'dark body not #fff').not.toBe('#ffffff')
    }

    // Muted meta (time · account) — muted-foreground floor on the card surface.
    const meta = page.locator('.text-muted-foreground').filter({ hasText: 'เงินสด' }).first()
    const mutedMeta = await contrastOf(meta)
    console.log(`[contrast] Txn muted  (${theme}) ratio=${mutedMeta.ratio} fg=${mutedMeta.fg} bg=${mutedMeta.bg}`)
    expect(mutedMeta.ratio, `Txn muted (${theme}) fg=${mutedMeta.fg} bg=${mutedMeta.bg}`).toBeGreaterThanOrEqual(AA)

    // No backdrop-blur behind the sticky day-header text (v3 anti-pattern).
    const dayHeader = page.locator('h2', { hasText: 'วันนี้' }).first()
    const backdrop = await dayHeader.evaluate((el) => {
      const s = getComputedStyle(el.parentElement ?? el)
      return (s.backdropFilter || (s as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter || 'none')
    })
    expect(backdrop === 'none' || backdrop === '', `day-header backdrop-filter=${backdrop}`).toBeTruthy()
  })
}
