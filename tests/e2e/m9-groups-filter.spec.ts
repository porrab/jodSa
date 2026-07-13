import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetAllUserData, seedAccount, seedGroup, seedTransaction } from './helpers/admin'

/**
 * QA-M9 — Groups → filter (design v3 J5), production build.
 *
 * "Groups" (M3) leaves the nav (one overlapping mental model with trip sessions);
 * existing grouped data must stay reachable via a filter chip on /transactions.
 * Behavioral proof:
 *  - No /groups link in the desktop sidebar, the mobile bottom bar, or /more.
 *  - The group's chip on /transactions filters the list to its members.
 */

test.use({ storageState: STORAGE_A })

let userId: string
let acct: string

test.beforeAll(async () => {
  const u = await findUserByEmail(env.userA.email)
  if (!u) throw new Error(`test user A missing: ${env.userA.email}`)
  userId = u.id
  await resetAllUserData(userId)
  acct = await seedAccount(userId, 'เงินสด', 'KBank')
  const group = await seedGroup(userId, 'ทริปทะเล QA-M9')
  await seedTransaction(userId, acct, { amountSatang: 42_000, counterparty: 'ค่าที่พักทะเล', groupId: group })
  await seedTransaction(userId, acct, { amountSatang: 15_000, counterparty: 'ร้านสะดวกซื้อทั่วไป', groupId: null })
})

test('M9-groups-1 "groups" is absent from every nav surface (sidebar, mobile bar, /more)', async ({ page }) => {
  // Desktop sidebar.
  await page.goto('/dashboard')
  await expect(page.locator('aside').getByRole('link', { name: 'รายการ', exact: true })).toBeVisible()
  await expect(page.locator('a[href="/groups"]')).toHaveCount(0)

  // Mobile bottom bar (md:hidden) — resize + reload. The mobile <nav> renders
  // before the (now-hidden) desktop sidebar, so .first() is the visible mobile link.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('a[href="/dashboard"]').first()).toBeVisible()
  await expect(page.locator('a[href="/groups"]')).toHaveCount(0)

  // /more management menu (scope to the page's card grid, not the nav chrome).
  await page.goto('/more')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.grid a[href="/groups"]')).toHaveCount(0)
  await expect(page.locator('.grid a[href="/sessions"]')).toBeVisible() // ทริป still present
})

test('M9-groups-2 grouped data is reachable via the /transactions filter chip', async ({ page }) => {
  await page.goto('/transactions')
  await page.waitForLoadState('networkidle')

  // Both items visible under the default "ทั้งหมด" filter.
  await expect(page.getByText('ค่าที่พักทะเล')).toBeVisible()
  await expect(page.getByText('ร้านสะดวกซื้อทั่วไป')).toBeVisible()

  // The group chip exists (chip row only renders because a group exists) and filters.
  await expect(page.getByRole('button', { name: 'ทั้งหมด', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'ทริปทะเล QA-M9', exact: true }).click()

  await expect(page.getByText('ค่าที่พักทะเล')).toBeVisible()
  await expect(page.getByText('ร้านสะดวกซื้อทั่วไป')).toHaveCount(0)
})
