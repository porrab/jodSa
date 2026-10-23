import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'
import { env, STORAGE_A } from './helpers/env'
import {
  findUserByEmail,
  resetAllUserData,
  resetInvestData,
  seedAccount,
  seedBudget,
  seedInvestHolding,
  seedTransaction,
} from './helpers/admin'

test.describe.configure({ mode: 'serial' })
test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })

const EVIDENCE_DIR = path.resolve('tests/e2e/evidence/ds-2')
let userId: string

test.beforeAll(async () => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`Missing DS-2 evidence user ${env.userA.email}`)
  userId = user.id
})

async function seedHome({ empty = false, over = false }: { empty?: boolean; over?: boolean } = {}) {
  await resetAllUserData(userId)
  await resetInvestData(userId)
  const accountIds: string[] = []
  for (const [name, bank] of [
    ['make', 'KBank'],
    ['Dime! Save', 'KKP'],
    ['SCB หลัก', 'SCB'],
    ['krungthai', 'KTB'],
    ['TrueMoney', 'TrueMoney'],
    ['เงินสด', 'Cash'],
  ] as const) accountIds.push(await seedAccount(userId, name, bank))

  await seedBudget(userId, 1_000_000)
  await seedInvestHolding(userId, {
    symbol: 'PTT',
    currentValueMinor: '2127900',
    ledger: [{ type: 'buy', qty: '10', priceMinor: '10000', datetime: '2026-01-01T00:00:00Z' }],
  })
  if (!empty) {
    const rows = over
      ? [
          { type: 'expense' as const, amountSatang: 1_042_000, category: 'food', counterparty: 'ค่าใช้จ่ายเกินงบ', datetime: '2026-10-23T19:02:00+07:00' },
          { type: 'income' as const, amountSatang: 2_694_038, category: 'salary', counterparty: 'เงินเดือน', datetime: '2026-10-23T12:30:00+07:00' },
          { type: 'income' as const, amountSatang: 200_000, category: 'other', counterparty: 'เงินคืน', datetime: '2026-10-23T08:15:00+07:00' },
        ]
      : [
          { type: 'expense' as const, amountSatang: 125_000, category: 'food', counterparty: 'ข้าวเย็นกับแม่', datetime: '2026-10-23T19:02:00+07:00' },
          { type: 'expense' as const, amountSatang: 12_000, category: 'food', counterparty: '7-Eleven สาขาสามย่าน', datetime: '2026-10-23T12:30:00+07:00' },
          { type: 'income' as const, amountSatang: 200_000, category: 'other', counterparty: 'โอน make → Dime! Save', datetime: '2026-10-23T08:15:00+07:00' },
        ]
    for (const row of rows) await seedTransaction(userId, accountIds[0], row)
  }
}

async function capture(page: Page, name: string, theme: 'light' | 'dark') {
  await page.addInitScript((value: string) => localStorage.setItem('theme', value), theme)
  await page.goto('/dashboard')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.locator('nextjs-portal').evaluateAll((nodes) => nodes.forEach((node) => node.remove()))
  await expect(page.getByTestId('home-layout')).toBeVisible()
  await page.screenshot({ path: path.join(EVIDENCE_DIR, `app-home-${name}.png`) })
}

test('capture filled light', async ({ page }) => {
  await seedHome()
  await capture(page, 'filled', 'light')
})

test('capture empty light', async ({ page }) => {
  await seedHome({ empty: true })
  await capture(page, 'empty', 'light')
})

test('capture over-budget light', async ({ page }) => {
  await seedHome({ over: true })
  await capture(page, 'over-budget', 'light')
})

test('capture filled dark', async ({ page }) => {
  await seedHome()
  await capture(page, 'dark', 'dark')
})
