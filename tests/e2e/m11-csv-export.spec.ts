import { expect, test } from '@playwright/test'
import { findUserByEmail, resetAllUserData, resetInvestData, seedAccount, seedInvestHolding, seedTransaction } from './helpers/admin'
import { env, STORAGE_A } from './helpers/env'

test.use({ storageState: STORAGE_A, viewport: { width: 390, height: 844 } })

let aId = ''
let bId = ''

test.afterEach(async () => {
  if (aId) await Promise.all([resetAllUserData(aId), resetInvestData(aId)])
  if (bId) await resetAllUserData(bId)
})

test('M11 exports the filtered A ledger with CSV-safe transfer and investment fields', async ({ page }) => {
  const [a, b] = await Promise.all([findUserByEmail(env.userA.email), findUserByEmail(env.userB.email)])
  if (!a || !b) throw new Error('test users missing')
  aId = a.id; bId = b.id
  await Promise.all([resetAllUserData(a.id), resetInvestData(a.id), resetAllUserData(b.id)])
  const [accountA, accountA2, accountB] = await Promise.all([seedAccount(a.id, 'M11 A', 'KBank'), seedAccount(a.id, 'M11 To', 'SCB'), seedAccount(b.id, 'M11 B', 'KBank')])
  const holdingId = await seedInvestHolding(a.id, { symbol: 'PTT', currentValueMinor: '10000', ledger: [{ type: 'buy', qty: '1', priceMinor: '10000', datetime: '2026-11-08T16:59:00.000Z' }] })
  await Promise.all([
    seedTransaction(a.id, accountA, { type: 'expense', amountSatang: 12_345, datetime: '2026-11-08T16:59:00.000Z', counterparty: '=unsafe', note: 'note, comma' }),
    seedTransaction(a.id, accountA, { type: 'transfer', amountSatang: 500, datetime: '2026-11-08T16:59:00.000Z', toAccountId: accountA2 }),
    seedTransaction(a.id, accountA, { type: 'invest', amountSatang: 1_000, datetime: '2026-11-08T16:59:00.000Z', holdingId }),
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
  expect(csv).toContain('"note, comma"')
  expect(csv).toContain('M11 A,M11 To')
  expect(csv).toContain(',PTT,')
  expect(csv).not.toContain('B-private')
  expect(csv.trim().split('\n')).toHaveLength(4) // header plus expense, transfer, invest

  await page.getByRole('button', { name: 'รายจ่าย' }).click()
  const transferDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'ดาวน์โหลด CSV' }).click()
  const transferStream = await (await transferDownload).createReadStream()
  const transferParts: Buffer[] = []
  for await (const part of transferStream!) transferParts.push(part as Buffer)
  const transferCsv = Buffer.concat(transferParts).toString('utf8')
  expect(transferCsv).toContain('transfer')
  expect(transferCsv).not.toContain('123.45')
})
