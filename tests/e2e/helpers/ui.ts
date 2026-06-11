import { expect, type Page } from '@playwright/test'

/** Log in through the real login form and land on the dashboard. */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login')
  await page.getByLabel('อีเมล').fill(email)
  await page.getByLabel('รหัสผ่าน').fill(password)
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click()
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

/** Create a bank account via the accounts dialog. */
export async function createAccount(page: Page, name: string, bank: string): Promise<void> {
  await page.goto('/accounts')
  await page.getByRole('button', { name: 'เพิ่มบัญชี' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('ชื่อบัญชี').fill(name)
  await dialog.getByRole('combobox').click()
  await page.getByRole('option', { name: bank, exact: true }).click()
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

export type NewTransaction = {
  type: 'income' | 'expense' | 'transfer'
  amount: string
  account: string
  toAccount?: string
}

const TYPE_LABEL = { income: 'รายรับ', expense: 'รายจ่าย', transfer: 'โอนเงิน' } as const

/** Log a transaction via the transactions dialog. */
export async function addTransaction(page: Page, tx: NewTransaction): Promise<void> {
  await page.goto('/transactions')
  await page.getByRole('button', { name: 'เพิ่มรายการ' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: TYPE_LABEL[tx.type], exact: true }).click()
  await dialog.getByLabel('จำนวนเงิน (บาท)').fill(tx.amount)

  // Comboboxes in DOM order: source account first, then destination (transfer) or category
  await dialog.getByRole('combobox').first().click()
  await page.getByRole('option', { name: new RegExp(escapeRegex(tx.account)) }).click()

  if (tx.type === 'transfer') {
    if (!tx.toAccount) throw new Error('transfer needs toAccount')
    await dialog.getByRole('combobox').nth(1).click()
    await page.getByRole('option', { name: new RegExp(escapeRegex(tx.toAccount)) }).click()
  }

  await dialog.getByRole('button', { name: 'บันทึกรายการ' }).click()
  await expect(dialog).toBeHidden({ timeout: 20_000 })
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
