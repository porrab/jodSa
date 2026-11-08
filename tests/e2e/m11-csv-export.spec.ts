import { expect, test } from '@playwright/test'
import { findUserByEmail, resetAllUserData, resetInvestData, seedAccount, seedTransaction } from './helpers/admin'
import { env, STORAGE_A } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })

test('M11 exports only A rows with the selected range, BOM and CSV-safe values', async ({ page }) => {
  const [a, b] = await Promise.all([findUserByEmail(env.userA.email), findUserByEmail(env.userB.email)])
  if (!a || !b) throw new Error('test users missing')
  await Promise.all([resetAllUserData(a.id), resetInvestData(a.id), resetAllUserData(b.id)])
  const [accountA, accountB] = await Promise.all([seedAccount(a.id, 'M11 A', 'KBank'), seedAccount(b.id, 'M11 B', 'KBank')])
  await Promise.all([
    seedTransaction(a.id, accountA, { type: 'expense', amountSatang: 12_345, datetime: '2026-11-08T16:59:00.000Z', counterparty: '=unsafe' }),
    seedTransaction(a.id, accountA, { type: 'income', amountSatang: 500, datetime: '2026-11-08T17:01:00.000Z', category: 'salary' }),
    seedTransaction(b.id, accountB, { type: 'expense', amountSatang: 999, datetime: '2026-11-08T16:59:00.000Z', counterparty: 'B-private' }),
  ])
  await page.goto('/settings')
  await page.getByLabel('ตั้งแต่').fill('2026-11-08')
  await page.getByLabel('ถึง').fill('2026-11-08')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'ดาวน์โหลด CSV' }).click()
  const text = await (await download).createReadStream().then(async (stream) => {
    const parts: Buffer[] = []
    for await (const part of stream!) parts.push(part as Buffer)
    return Buffer.concat(parts)
  })
  expect(text.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))
  const csv = text.toString('utf8')
  expect(csv).toContain('123.45')
  expect(csv).toContain("'=unsafe")
  expect(csv).not.toContain('B-private')
  expect(csv.trim().split('\n')).toHaveLength(2) // header plus the 23:59 Bangkok row
})
