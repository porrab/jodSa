import { test, expect } from '@playwright/test'
import { env, STORAGE_A, STORAGE_B } from './helpers/env'
import { findUserByEmail, resetUserData } from './helpers/admin'
import { createAccount, addTransaction } from './helpers/ui'

/**
 * M1-S2 — cross-user isolation through the UI: User B sees ZERO of User A's
 * rows. Complements tests/unit/rls.test.ts (API level) with the user-visible
 * journey; uses two genuinely distinct users (pm-desk pattern P3).
 */

test('M1-S2 user B sees none of user A data', async ({ browser }) => {
  for (const email of [env.userA.email, env.userB.email]) {
    const user = await findUserByEmail(email)
    if (!user) throw new Error(`test user missing: ${email}`)
    await resetUserData(user.id)
  }

  const isoName = `QA-ISO-${Date.now().toString().slice(-6)}`

  // User A seeds a uniquely-named account + income through the UI
  const ctxA = await browser.newContext({ storageState: STORAGE_A })
  const pageA = await ctxA.newPage()
  await createAccount(pageA, isoName, 'SCB')
  await addTransaction(pageA, { type: 'income', amount: '500', account: isoName })
  await pageA.goto('/transactions')
  await expect(pageA.getByText('+฿500.00').first()).toBeVisible()
  await ctxA.close()

  // User B must see an empty world
  const ctxB = await browser.newContext({ storageState: STORAGE_B })
  const pageB = await ctxB.newPage()

  await pageB.goto('/accounts')
  await expect(pageB.getByText('ยังไม่มีบัญชี')).toBeVisible()
  await expect(pageB.getByText(isoName)).toHaveCount(0)

  await pageB.goto('/transactions')
  await expect(pageB.getByText('ยังไม่มีรายการ')).toBeVisible()
  await expect(pageB.getByText('+฿500.00')).toHaveCount(0)

  await pageB.goto('/dashboard')
  await expect(pageB.getByText('฿0.00').first()).toBeVisible()
  await expect(pageB.getByText(isoName)).toHaveCount(0)
  await ctxB.close()
})
