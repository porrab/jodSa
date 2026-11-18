import { expect, test } from '@playwright/test'
import { env, STORAGE_A } from './helpers/env'
import { findUserByEmail, resetInvestData, seedAccount, testUserClient } from './helpers/admin'
import { addHolding, updatePrice } from './helpers/invest'
import th from '../../messages/th.json'

test.use({ storageState: STORAGE_A, viewport: { width: 375, height: 812 } })
test('RV-UX-2 Holdings and Overview share mixed-currency values and cost-fallback notes', async ({ page }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing test user A')
  await resetInvestData(user.id)
  const accountId = await seedAccount(user.id, 'Portfolio equality fixture', 'SCB')
  try {
    await addHolding(page, { asset: '(AAPL)', qty: '1', price: '100', fx: '35' })
    await addHolding(page, { asset: '(PTT)', qty: '10', price: '30' })
    await page.goto('/invest'); await page.waitForLoadState('networkidle')
    const fallback = await page.getByTestId('holdings-total').innerText()
    const costNote = th.invest.unpricedNote.replace('{count}', '2')
    await expect(page.getByText(costNote, { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: th.invest.tabOverview, exact: true }).click()
    await expect(page.getByTestId('overview-total')).toHaveText('฿3,800.00')
    await expect(page.getByTestId('overview-total')).toHaveText(fallback)
    await expect(page.getByText(costNote, { exact: true })).toBeVisible()
    await updatePrice(page, { asset: 'Apple', value: '267.96', fx: '35' })
    await updatePrice(page, { asset: 'ปตท.', value: '123.45' })
    await page.goto('/invest'); await page.waitForLoadState('networkidle')
    const priced = await page.getByTestId('holdings-total').innerText()
    await expect(page.getByTestId('holdings-total')).toHaveText('฿9,502.05')
    await expect(page.getByText(costNote, { exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: th.invest.tabOverview, exact: true }).click()
    await expect(page.getByTestId('overview-total')).toHaveText(priced)
    await expect(page.getByText(costNote, { exact: true })).toHaveCount(0)
  } finally {
    await resetInvestData(user.id)
    const db = await testUserClient(user.id)
    expect((await db.from('accounts').delete().eq('id', accountId)).error).toBeNull()
  }
})
