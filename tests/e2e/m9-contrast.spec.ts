import { test, expect, type Locator, type Page } from '@playwright/test'
import { adminClient, findUserByEmail, resetAllUserData, seedAccount } from './helpers/admin'
import { env, STORAGE_A } from './helpers/env'

/**
 * Visual language v6 R0 — browser-computed Honey token contrast.
 *
 * Values are resolved by Chromium from the shipped CSS custom properties, painted
 * to sRGB, then measured with the WCAG 2.x relative-luminance formula. This catches
 * invalid mappings and browser conversion drift instead of trusting the design hex.
 */

type Pair = {
  name: string
  foreground: string
  background: string
  minimum: number
  maximum?: number
}

const TEXT_PAIRS: Pair[] = [
  { name: 'ink on page', foreground: '--foreground', background: '--background', minimum: 4.5, maximum: 13.1 },
  { name: 'ink on surface', foreground: '--foreground', background: '--card', minimum: 4.5, maximum: 13.6 },
  { name: 'muted on page', foreground: '--muted-foreground', background: '--background', minimum: 4.5 },
  { name: 'muted on surface', foreground: '--muted-foreground', background: '--card', minimum: 4.5 },
  { name: 'muted on track', foreground: '--muted-foreground', background: '--muted', minimum: 4.5 },
  { name: 'muted on honey-soft', foreground: '--muted-foreground', background: '--secondary', minimum: 4.5 },
  { name: 'on-honey', foreground: '--primary-foreground', background: '--primary', minimum: 4.5 },
  { name: 'honey link on page', foreground: '--honey-text', background: '--background', minimum: 4.5 },
  { name: 'honey link on surface', foreground: '--honey-text', background: '--card', minimum: 4.5 },
  { name: 'honey link on honey-soft', foreground: '--honey-text', background: '--secondary', minimum: 4.5 },
  { name: 'hero figure on hero', foreground: '--hero-figure', background: '--hero', minimum: 4.5 },
  { name: 'on-hero', foreground: '--hero-foreground', background: '--hero', minimum: 4.5 },
  { name: 'hero muted on hero', foreground: '--hero-muted', background: '--hero', minimum: 4.5 },
  { name: 'hero muted on inset', foreground: '--hero-muted', background: '--hero-inset', minimum: 4.5 },
  { name: 'income on page', foreground: '--income', background: '--background', minimum: 4.5 },
  { name: 'income on surface', foreground: '--income', background: '--card', minimum: 4.5 },
  { name: 'income on success-soft', foreground: '--income', background: '--success-soft', minimum: 4.5 },
  { name: 'expense on page', foreground: '--expense', background: '--background', minimum: 4.5 },
  { name: 'expense on surface', foreground: '--expense', background: '--card', minimum: 4.5 },
  { name: 'expense on blush', foreground: '--expense', background: '--blush', minimum: 4.5 },
  { name: 'transfer on page', foreground: '--transfer', background: '--background', minimum: 4.5 },
  { name: 'transfer on surface', foreground: '--transfer', background: '--card', minimum: 4.5 },
  { name: 'transfer on info-soft', foreground: '--transfer', background: '--info-soft', minimum: 4.5 },
  { name: 'over on blush', foreground: '--destructive', background: '--blush', minimum: 4.5 },
  { name: 'over on page', foreground: '--destructive', background: '--background', minimum: 4.5 },
  { name: 'warn on warn-soft', foreground: '--warn', background: '--warn-soft', minimum: 4.5 },
  { name: 'warn on surface', foreground: '--warn', background: '--card', minimum: 4.5 },
]

const NON_TEXT_PAIRS: Pair[] = [
  { name: 'honey outline on page', foreground: '--honey-edge', background: '--background', minimum: 3 },
  { name: 'honey outline on track', foreground: '--honey-edge', background: '--muted', minimum: 3 },
  { name: 'input boundary on surface', foreground: '--input', background: '--card', minimum: 3 },
  { name: 'input boundary on page', foreground: '--input', background: '--background', minimum: 3 },
  { name: 'investment split on hero', foreground: '--invest-bar', background: '--hero', minimum: 3 },
]

async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.goto('/login')
  await page.evaluate((nextTheme) => localStorage.setItem('theme', nextTheme), theme)
  await page.reload()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
    .toBe(theme === 'dark')
}

async function contrastTable(page: Page, pairs: Pair[]): Promise<Array<Pair & { ratio: number; fg: string; bg: string }>> {
  return page.evaluate((requestedPairs) => {
    const rootStyle = getComputedStyle(document.documentElement)
    const paint = (color: string): [number, number, number] => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data
      return [r, g, b]
    }
    const luminance = ([r, g, b]: number[]) => {
      const channel = (value: number) => {
        const normalized = value / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const hex = (rgb: number[]) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`

    return requestedPairs.map((pair) => {
      const foreground = paint(rootStyle.getPropertyValue(pair.foreground).trim())
      const background = paint(rootStyle.getPropertyValue(pair.background).trim())
      const foregroundLuminance = luminance(foreground)
      const backgroundLuminance = luminance(background)
      const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
        / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
      return { ...pair, ratio: Math.round(ratio * 100) / 100, fg: hex(foreground), bg: hex(background) }
    })
  }, pairs)
}

async function renderedContrast(locator: Locator): Promise<{ ratio: number; fg: string; bg: string }> {
  return locator.evaluate((element) => {
    const paint = (color: string): [number, number, number] => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1
      const context = canvas.getContext('2d')!
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data
      return [r, g, b]
    }
    const luminance = ([r, g, b]: number[]) => {
      const channel = (value: number) => {
        const normalized = value / 255
        return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const hex = (rgb: number[]) => `#${rgb.map((value) => value.toString(16).padStart(2, '0')).join('')}`
    const foreground = paint(getComputedStyle(element).color)
    let backgroundElement: Element | null = element
    let backgroundColor = 'rgba(0, 0, 0, 0)'
    while (backgroundElement) {
      backgroundColor = getComputedStyle(backgroundElement).backgroundColor
      if (!/^rgba?\(0(?:, 0, 0, 0| 0 0 \/ 0)\)$/.test(backgroundColor) && backgroundColor !== 'transparent') break
      backgroundElement = backgroundElement.parentElement
    }
    const background = paint(backgroundColor)
    const foregroundLuminance = luminance(foreground)
    const backgroundLuminance = luminance(background)
    const ratio = (Math.max(foregroundLuminance, backgroundLuminance) + 0.05)
      / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
    return { ratio: Math.round(ratio * 100) / 100, fg: hex(foreground), bg: hex(background) }
  })
}

async function expectRenderedTextContrast(locator: Locator, label: string): Promise<void> {
  await expect(locator).toBeVisible()
  const result = await renderedContrast(locator)
  expect.soft(result.ratio, `${label}: ${result.fg} on ${result.bg}`).toBeGreaterThanOrEqual(4.5)
}

for (const theme of ['light', 'dark'] as const) {
  test(`R0 Honey contrast table (${theme})`, async ({ page }) => {
    await setTheme(page, theme)
    const results = await contrastTable(page, [...TEXT_PAIRS, ...NON_TEXT_PAIRS])

    for (const result of results) {
      expect(result.ratio, `${theme} ${result.name}: ${result.fg} on ${result.bg}`)
        .toBeGreaterThanOrEqual(result.minimum)
      if (result.maximum !== undefined) {
        expect(result.ratio, `${theme} ${result.name} ceiling: ${result.fg} on ${result.bg}`)
          .toBeLessThanOrEqual(result.maximum)
      }
    }

    const honeyFill = await contrastTable(page, [
      { name: 'honey fill on page', foreground: '--primary', background: '--background', minimum: 0 },
      { name: 'honey fill on track', foreground: '--primary', background: '--muted', minimum: 0 },
    ])
    if (theme === 'light') {
      expect(honeyFill[0].ratio, 'light honey fill requires its brown outline').toBeLessThan(3)
      expect(honeyFill[1].ratio, 'light budget fill requires its brown outline').toBeLessThan(3)
    } else {
      expect(honeyFill[0].ratio, 'dark honey fill clears non-text contrast').toBeGreaterThanOrEqual(3)
      expect(honeyFill[1].ratio, 'dark budget fill clears non-text contrast').toBeGreaterThanOrEqual(3)
    }
  })
}

test.describe('F5 rendered link contrast', () => {
  test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })

  let userId = ''

  test.beforeAll(async () => {
    const user = await findUserByEmail(env.userA.email)
    if (!user) throw new Error(`Test user A is missing: ${env.userA.email}`)
    userId = user.id
  })

  for (const theme of ['light', 'dark'] as const) {
    test(`F5 links use computed 4.5:1 text contrast (${theme})`, async ({ page }) => {
      await resetAllUserData(userId)
      const accountId = await seedAccount(userId, 'บัญชี F5', 'กสิกรไทย', '4415')
      const { error } = await adminClient().from('accounts').update({ opening_balance_satang: 100_000 })
        .eq('id', accountId).eq('user_id', userId)
      if (error) throw new Error(`seed F5 opening balance failed: ${error.message}`)
      await setTheme(page, theme)

      await page.goto('/dashboard')
      await page.getByRole('button', { name: 'เพิ่มรายการ', exact: true }).click()
      const addSheet = page.getByRole('dialog', { name: 'บันทึกรายการ' })
      await expectRenderedTextContrast(
        addSheet.getByRole('button', { name: '+ ตั้งชื่อที่แสดงเอง' }),
        `${theme} + ตั้งชื่อที่แสดงเอง`,
      )

      await page.goto('/accounts')
      await page.getByRole('button', { name: /บัญชี F5.*฿1,000\.00/ }).click()
      await page.getByRole('button', { name: 'ปรับยอดให้ตรงธนาคาร' }).click()
      const step1 = page.getByRole('dialog', { name: 'ปรับยอดให้ตรงธนาคาร · บัญชี F5' })
      await step1.getByLabel('ยอดในแอปธนาคารตอนนี้').fill('500.00')
      await step1.getByRole('button', { name: 'ลงรายการที่ขาด' }).click()

      const step2 = page.getByRole('dialog', { name: 'ลงรายการที่ขาด · บัญชี F5' })
      const later = step2.getByRole('button', { name: 'ไว้ลงต่อทีหลัง' })
      await expectRenderedTextContrast(later, `${theme} ไว้ลงต่อทีหลัง`)
      await later.click()
      await step2.getByRole('button', { name: /บันทึกส่วนที่เหลือ/ }).click()

      const step3 = page.getByRole('dialog', { name: 'บันทึกยอดปรับ · บัญชี F5' })
      await expectRenderedTextContrast(
        step3.getByRole('button', { name: 'กลับไปลงต่อ' }),
        `${theme} กลับไปลงต่อ`,
      )
    })
  }
})
