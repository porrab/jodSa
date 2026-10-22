import { test, expect, type Page } from '@playwright/test'

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
