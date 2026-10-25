import { expect, test } from '@playwright/test'

import { findUserByEmail, resetAllUserData, seedAccount, seedTransaction } from './helpers/admin'
import { env, STORAGE_A } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })
test.describe.configure({ mode: 'serial' })

test('DS-5 C12 transactions render without hydration console errors', async ({ page }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error(`test user A missing: ${env.userA.email}`)

  await resetAllUserData(user.id)
  const accountId = await seedAccount(user.id, 'บัญชี C12', 'SCB')
  await seedTransaction(user.id, accountId, {
    type: 'income',
    amountSatang: 12_500,
    category: 'food',
    datetime: new Date().toISOString(),
  })

  const hydrationErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydration|server rendered text didn't match/i.test(message.text())) {
      hydrationErrors.push(message.text())
    }
  })

  await page.goto('/transactions')
  await expect(page.getByRole('heading', { name: 'รายการ' })).toBeVisible()
  await page.waitForTimeout(500)

  expect(hydrationErrors).toEqual([])
})

test('DS-5 N1 recurring account tiles show their balance', async ({ page }) => {
  await page.goto('/recurring')
  await page.getByRole('button', { name: 'เพิ่ม', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('฿125', { exact: true })).toBeVisible()
  await expect(dialog.getByText('—', { exact: true })).toHaveCount(0)
})
