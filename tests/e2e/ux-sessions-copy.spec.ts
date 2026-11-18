import { test, expect } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, seedAccount } from './helpers/admin'
import { clearOwnerSessions, seedTripSession, deleteTripSession } from './helpers/trip'
import th from '../../messages/th.json'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
test('DS-13 sessions keep one empty prompt and a short populated trust note', async ({ page }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing canonical test user A')
  await clearOwnerSessions(user.id); await seedAccount(user.id, 'Session copy test', 'SCB')
  await page.goto('/sessions'); await page.waitForLoadState('networkidle')
  await expect(page.getByText(th.session.emptyHint, { exact: true })).toBeVisible()
  await expect(page.getByText(th.session.subtitle, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'เพิ่ม', exact: true }).click()
  await expect(page.getByRole('dialog').getByText(th.session.typeCollectHint, { exact: true })).toBeVisible()
  const trip = await seedTripSession(user.id, 'Session copy fixture')
  try {
    await page.goto('/sessions')
    await expect(page.getByText(th.session.recordedSummary, { exact: true })).toBeVisible()
    await expect(page.getByText(th.session.emptyHint, { exact: true })).toHaveCount(0)
    await expect(page.getByText(th.session.subtitle, { exact: true })).toHaveCount(0)
  } finally { await deleteTripSession(trip) }
})
