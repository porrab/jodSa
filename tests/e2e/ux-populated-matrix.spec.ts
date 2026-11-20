import { test, expect, type Page } from '@playwright/test'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { adminClient, ensureConfirmedUser, deleteUserById, seedAccount, seedBudget, seedTransaction, seedGroup, seedInvestHolding, testUserClient } from './helpers/admin'
import { requireDisposableTestEmail } from './helpers/test-user-guard'
import { seedTripSession } from './helpers/trip'
import { login } from './helpers/ui'
import th from '../../messages/th.json'

// No canonical A/B storage, setup dependency, resets, or owner identity is used.
// Run: JODSA_UX_MATRIX=1 JODSA_E2E_PRODUCTION=1 pnpm exec playwright test ux-populated-matrix --no-deps
test.use({ storageState: { cookies: [], origins: [] }, viewport: { width: 375, height: 812 } })
const output = path.resolve('../../design-studio/reviews/jodsa/2026-11-20-populated')
// Reuse Next's installed sharp dependency under pnpm's strict resolution.
const sharp = createRequire(require.resolve('next/package.json'))('sharp')
const longCategory = 'ค่าเดินทางและที่พักสำหรับการท่องเที่ยวกับครอบครัวในวันหยุดยาว'
type Finding = { rule: string; selector: string; text: string; detail: string }
type Capture = { page: string; state: string; theme: string; width: number; failures: Finding[]; ellipses: Finding[] }

async function ready(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.locator('main').first()).toBeVisible()
}

async function inspect(page: Page): Promise<Pick<Capture, 'failures' | 'ellipses'>> {
  return page.evaluate(() => {
    const failures: Finding[] = []
    const ellipses: Finding[] = []
    const selector = (el: Element): string => {
      if (el.id) return `#${CSS.escape(el.id)}`
      const id = el.getAttribute('data-testid')
      if (id) return `[data-testid="${id}"]`
      if (!el.parentElement) return el.tagName.toLowerCase()
      return `${selector(el.parentElement)} > ${el.tagName.toLowerCase()}:nth-child(${[...el.parentElement.children].indexOf(el) + 1})`
    }
    const finding = (rule: string, el: Element, detail: string): Finding => ({
      rule, selector: selector(el), text: (el.textContent ?? '').trim().replace(/\s+/g, ' '), detail,
    })
    const root = document.documentElement
    if (root.scrollWidth > root.clientWidth) failures.push(finding('root-overflow', root, `${root.scrollWidth} > ${root.clientWidth}`))
    for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
      if (!(el instanceof HTMLElement) || !el.getClientRects().length) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || !el.clientWidth || !el.clientHeight) continue
      // Descendants of closed details and aria-hidden application backgrounds
      // have no rendered text; Range rectangles prevent counting those nodes.
      const range = document.createRange()
      range.selectNodeContents(el)
      if (!range.getClientRects().length) continue
      const text = el.textContent?.trim()
      if (text && el.scrollWidth > el.clientWidth + 1) {
        if (s.textOverflow === 'ellipsis') ellipses.push(finding('ellipsis', el, `${el.scrollWidth} > ${el.clientWidth}`))
        else if (s.overflowX === 'visible') failures.push(finding('text-overflow', el, `${el.scrollWidth} > ${el.clientWidth}`))
      }
      // Typed OM retains the difference between height:auto and a resolved
      // fixed/calc height. getComputedStyle().height alone loses that evidence.
      const typed = (el as HTMLElement & { computedStyleMap?: () => Map<string, { toString(): string }> }).computedStyleMap?.().get('height')?.toString()
      if (typed && typed !== 'auto' && s.overflowY === 'visible' && el.scrollHeight > el.clientHeight + 1) {
        failures.push(finding('fixed-height-overflow', el, `height=${typed}; ${el.scrollHeight} > ${el.clientHeight}`))
      }
    }
    // AppShell adds transparent container wrappers between main and the page.
    // Check section siblings under each wrapper, including Home's three sections.
    const parents = new Set([...document.querySelectorAll('main section')].map(el => el.parentElement!))
    for (const parent of parents) {
      const sections = [...parent.children].filter(el => el.tagName === 'SECTION')
      for (let i = 0; i < sections.length; i++) for (let j = i + 1; j < sections.length; j++) {
        const a = sections[i].getBoundingClientRect(), b = sections[j].getBoundingClientRect()
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) {
          failures.push(finding('section-overlap', sections[i], `intersects ${selector(sections[j])}`))
        }
      }
    }
    return { failures, ellipses }
  })
}

test('HB-5 populated signed-in responsive matrix', async ({ page }, testInfo) => {
  test.skip(process.env.JODSA_UX_MATRIX !== '1', 'Explicit disposable-user evidence job')
  test.setTimeout(900_000)
  await mkdir(output, { recursive: true })
  const files: string[] = []
  const captures: Capture[] = []
  const email = requireDisposableTestEmail(`qa-matrix-${Date.now()}@jodsa.test`)
  const password = `Matrix-${randomUUID()}!`
  let userId: string | undefined
  let deletion = 'User not created'
  const manifest: Record<string, unknown> = { email, started: new Date().toISOString() }
  let runError: unknown

  async function capture(name: string, state: string, navigate: () => Promise<void>) {
    const light: { input: Buffer; left: number; top: number }[] = []
    let left = 0, maxHeight = 0
    for (const [theme, width] of [['light', 320], ['light', 375], ['light', 414], ['dark', 375]] as const) {
      await page.setViewportSize({ width, height: 812 })
      await page.evaluate(value => localStorage.setItem('theme', value), theme)
      await navigate()
      await ready(page)
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`))
      const result = await inspect(page)
      captures.push({ page: name, state, theme, width, ...result })
      // Inspect the real 812px viewport first. Only for the full-page export,
      // unwrap AppShell's inner scrollport; restore it immediately afterwards.
      const main = page.locator('main').first()
      const original = await main.getAttribute('style')
      let png: Buffer
      try {
        await main.evaluate(el => { el.style.height = `${el.scrollHeight}px`; el.style.overflowY = 'visible'; el.scrollTop = 0 })
        png = await page.screenshot({ fullPage: true, animations: 'disabled' })
      } finally {
        await main.evaluate((el, style) => { if (style === null) el.removeAttribute('style'); else el.setAttribute('style', style) }, original)
      }
      if (theme === 'dark') {
        const file = `${name}-${state}-dark.png`
        await writeFile(path.join(output, file), png)
        files.push(file)
      } else {
        const meta = await sharp(png).metadata()
        light.push({ input: png, left, top: 0 })
        left += meta.width!
        maxHeight = Math.max(maxHeight, meta.height!)
      }
    }
    const file = `${name}-${state}.png`
    await sharp({ create: { width: left, height: maxHeight, channels: 4, background: '#ffffff' } }).composite(light).png().toFile(path.join(output, file))
    files.push(file)
    // Persist after each page so a navigation error cannot discard prior findings.
    await writeFile(path.join(output, 'rules.json'), JSON.stringify(captures, null, 2))
  }

  try {
    userId = await ensureConfirmedUser(email, password, 'Responsive matrix disposable user')
    manifest.userId = userId
    await writeFile(path.join(output, 'fixture.json'), JSON.stringify({ ...manifest, deletion: 'pending finally cleanup' }, null, 2))
    const client = await testUserClient(userId)
    const checked = async (query: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await query
      if (error) throw new Error(error.message)
    }
    const accounts: string[] = []
    for (const [name, bank] of [
      ['บัญชีออมทรัพย์สำหรับค่าใช้จ่ายประจำวันและเงินสำรองของครอบครัว', 'SCB'],
      ['เงินเดือนและโบนัส', 'KBank'], ['ท่องเที่ยว', 'BBL'], ['เงินสดสำรอง', 'KTB'],
    ]) accounts.push(await seedAccount(userId, name, bank))
    const group = await seedGroup(userId, 'ทริปครอบครัวและเพื่อนสนิทช่วงวันหยุดยาวเชียงใหม่')
    const now = new Date()
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
    const date = (days: number) => {
      const d = new Date(`${today}T12:00:00+07:00`)
      // Stay in this budget month even when the matrix runs on the first day.
      d.setUTCDate(Math.max(1, d.getUTCDate() - days))
      return d.toISOString()
    }
    await seedTransaction(userId, accounts[0], { type: 'income', amountSatang: 500_000_000, category: 'salary', note: 'เงินออมและรายได้สะสม', datetime: date(4) })
    let expense = 0, foodExpense = 0, categoryExpense = 0
    for (let i = 0; i < 28; i++) {
      const type = i % 9 === 7 ? 'income' : i % 9 === 8 ? 'transfer' : 'expense'
      const amountSatang = i === 0 ? 123_456_789 : 12_345 + i * 111
      if (type === 'expense') {
        expense += amountSatang
        if (i % 2 === 0) categoryExpense += amountSatang
        else foodExpense += amountSatang
      }
      await seedTransaction(userId, accounts[i % 4], {
        type, amountSatang, datetime: date(i % 5),
        category: i % 2 === 0 ? longCategory : 'food',
        counterparty: `สมาชิกทริปหมายเลข ${i + 1} ชื่อและนามสกุลยาวสำหรับทดสอบหน้าจอขนาดเล็ก`,
        note: `รายการ ${i + 1} ค่าอาหาร ที่พัก และการเดินทางกับครอบครัว พร้อมหมายเหตุรายละเอียดเพิ่มเติมที่ต้องอ่านได้เมื่อเปิดดูรายการ`,
        groupId: i < 6 ? group : null,
        toAccountId: type === 'transfer' ? accounts[(i + 1) % 4] : null,
      })
    }
    // Start tomorrow: the three realistic rules do not change budget fixtures
    // through lazy materialization while the matrix navigates between routes.
    const tomorrow = new Date(`${today}T12:00:00+07:00`)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    await checked(client.from('recurring_rules').insert(['weekly', 'monthly', 'yearly'].map((freq, i) => ({
      user_id: userId, account_id: accounts[i], type: 'expense', amount_satang: [25000, 120000, 1500000][i],
      category: ['transport', 'food', longCategory][i], freq, interval: 1, start_date: tomorrow.toISOString().slice(0, 10),
    }))))
    const trip = await seedTripSession(userId, 'ทริปเชียงใหม่กับครอบครัวและเพื่อนสนิทหลายวัน')
    const participants = [trip.ownerParticipantId]
    for (let i = 0; i < 5; i++) {
      const { data, error } = await client.from('session_participants').insert({ session_id: trip.token,
        nickname: `เพื่อนร่วมทริป ${i + 1} ชื่อยาวและนามสกุลสำหรับทดสอบ`, participant_token: randomUUID(), is_owner: false,
      }).select('id').single()
      if (error) throw new Error(error.message)
      participants.push(data.id)
    }
    const { data: tripExpense, error: tripError } = await client.from('session_expenses').insert({ session_id: trip.token,
      payer_participant_id: trip.ownerParticipantId, title: 'ค่าที่พักและอาหารมื้อเย็นสำหรับสมาชิกทั้งหมด', total_amount_satang: 1234567, split_among: 6,
    }).select('id').single()
    if (tripError) throw new Error(tripError.message)
    await checked(client.from('session_slips').insert([false, true].map((confirmed, i) => ({ session_id: trip.token,
      expense_id: tripExpense.id, payer_participant_id: participants[i + 1], amount_satang: 205761,
      ref_code: `matrix-${randomUUID()}`, paid_at: now.toISOString(), confirmed,
    }))))
    const priced = await seedInvestHolding(userId, { symbol: 'PTT', currentValueMinor: '123456789', ledger: [{ type: 'buy', qty: '35000', priceMinor: '3500', datetime: date(3) }] })
    const usd = await seedInvestHolding(userId, { symbol: 'AAPL', currentValueMinor: '2345678', ledger: [{ type: 'buy', qty: '100', priceMinor: '21000', datetime: date(2) }] })
    await checked(client.from('holdings').update({ current_fx_to_display: '35.25' }).eq('id', usd).eq('user_id', userId))
    await checked(client.from('asset_transactions').update({ fx_rate: '35' }).eq('holding_id', usd).eq('user_id', userId))
    const { data: custom, error: customError } = await client.from('assets').insert({
      name: 'กองทุนสำรองสำหรับการเกษียณและอนาคตของครอบครัวชื่อยาวมาก', symbol: 'FAMILY-LONG', asset_class: 'thai_fund',
      currency: 'THB', proxy_class: 'thai_fund_generic', is_system: false, user_id: userId,
    }).select('id').single()
    if (customError) throw new Error(customError.message)
    const { data: unpriced, error: unpricedError } = await client.from('holdings').insert({ user_id: userId, asset_id: custom.id, sleeve: 'core' }).select('id').single()
    if (unpricedError) throw new Error(unpricedError.message)
    await checked(client.from('asset_transactions').insert({ user_id: userId, holding_id: unpriced.id, type: 'buy', qty: '100', price_minor: '10000', currency: 'THB', fees_minor: '0', datetime: date(1) }))
    manifest.fixture = { accounts: 4, transactions: 29, recurring: 3, groupMembers: 6, tripParticipants: 6, slips: { pending: 1, confirmed: 1 }, holdings: 3, expenseSatang: expense }
    await login(page, email, password)
    await ready(page)
    await page.goto('/invest')
    await ready(page)
    await page.getByRole('tab', { name: th.invest.tabPlan, exact: true }).click()
    await page.getByRole('checkbox', { name: th.invest.plan.disclaimerAck }).check()
    await page.getByRole('button', { name: th.invest.plan.generatePlan, exact: true }).click()
    await expect(page.getByText(th.invest.plan.noPlansYet, { exact: true })).toHaveCount(0)
    await page.waitForLoadState('networkidle')
    const { data: plans, error: planError } = await client.from('plans').select('id').eq('user_id', userId)
    if (planError) throw new Error(planError.message)
    expect(plans).toHaveLength(1)
    manifest.generatedPlans = plans!.length

    for (const state of ['no-budget', 'under', 'near', 'over', 'category-long'] as const) {
      await checked(client.from('budgets').delete().eq('user_id', userId))
      if (state !== 'no-budget') {
        if (state !== 'category-long') await seedBudget(userId, Math.ceil(expense / ({ under: .5, near: .95, over: 1.25 }[state])))
        await seedBudget(userId, Math.ceil(categoryExpense / 1.25), { scope: 'category', category: longCategory })
        await seedBudget(userId, Math.ceil(foodExpense / .95), { scope: 'category', category: 'food' })
      }
      await capture('home', state, async () => { await page.goto('/dashboard') })
      await capture('budgets', state, async () => { await page.goto('/budgets') })
    }
    // Leave all three budgets present for every other populated route.
    await seedBudget(userId, expense * 2)
    const { data: recurring, error: recurringError } = await client.from('recurring_rules').select('id').eq('user_id', userId).eq('freq', 'weekly').single()
    if (recurringError) throw new Error(recurringError.message)
    await checked(client.from('recurring_rules').update({ start_date: today, materialized_through: null }).eq('user_id', userId).eq('id', recurring.id))
    for (const [name, route] of [
      ['transactions', '/transactions'], ['accounts', '/accounts'], ['recurring', '/recurring'],
      ['recurring-confirm', `/recurring/confirm?rule=${recurring.id}&date=${today}`],
      ['groups', '/groups'], ['group-detail', `/groups/${group}`], ['sessions', '/sessions'],
      ['session-detail', `/sessions/${trip.token}`], ['invest-holdings', '/invest'],
      ['settings', '/settings'], ['more', '/more'], ['import', '/import'],
    ]) await capture(name, 'populated', async () => { await page.goto(route) })
    for (const mode of ['detail', 'edit']) await capture(`transaction-${mode}`, 'populated', async () => {
      await page.goto('/transactions'); await ready(page)
      await page.locator('[data-testid^="transaction-"]').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
      if (mode === 'edit') {
        await page.getByRole('dialog').getByRole('button', { name: th.common.edit, exact: true }).click()
        await expect(page.getByRole('dialog').locator('input[name="amount"]')).toBeVisible()
      }
    })
    for (const [name, tab] of [['invest-overview', th.invest.tabOverview], ['invest-plan', th.invest.tabPlan]]) {
      await capture(name, 'populated', async () => {
        await page.goto('/invest'); await ready(page)
        await page.getByRole('tab', { name: tab, exact: true }).click()
      })
    }
    await capture('invest-plan-result', 'populated', async () => {
      await page.goto('/invest'); await ready(page)
      await page.getByRole('tab', { name: th.invest.tabPlan, exact: true }).click()
      await page.getByText(th.invest.plan.planHistory, { exact: true }).locator('..').getByRole('button').first().click()
      await expect(page.getByRole('dialog')).toBeVisible()
    })
    await capture('holding-detail', 'populated', async () => {
      await page.goto(`/invest?holding=${priced}`)
      await expect(page.getByRole('dialog')).toBeVisible()
    })
    expect(captures).toHaveLength(112)
  } catch (error) {
    runError = error
  } finally {
    if (userId) {
      try {
        await deleteUserById(userId)
        const { data, error } = await adminClient().auth.admin.getUserById(userId)
        if (data.user || !error || error.status !== 404) throw new Error('Deleted user still exists or absence could not be verified')
        deletion = `Deleted disposable user ${userId} using deleteUserById(returned id); verified auth getUserById returns 404`
      } catch (error) { deletion = `DELETION FAILED: ${String(error)}`; runError ??= error }
    }
    manifest.deletion = deletion
    manifest.error = runError ? String(runError) : null
    await writeFile(path.join(output, 'fixture.json'), JSON.stringify(manifest, null, 2))
    await writeFile(path.join(output, 'rules.json'), JSON.stringify(captures, null, 2))
    const describe = (row: Capture, f: Finding) => `- ${row.page}/${row.state} ${row.theme} ${row.width}: **${f.rule}** \`${f.selector}\` — ${f.text} (${f.detail})`
    const failures = captures.flatMap(row => row.failures.map(f => describe(row, f)))
    const ellipses = captures.flatMap(row => row.ellipses.map(f => describe(row, f)))
    await writeFile(path.join(output, 'index.md'), [
      '# Populated responsive matrix — 2026-11-20', '',
      'Light contact sheets: left to right 320, 375, 414 × 812. Dark: 375 × 812. Screenshots were written only; no image was opened by Codex.',
      'Rules inspect the real viewport before capture. Full-page export expands only main’s inner scrollport, then restores it. Group members are transactions in the current schema; the trip additionally has six named participants.', '',
      `Captures: ${captures.length}; rule failures: ${failures.length}; rendered ellipses: ${ellipses.length}.`,
      `Cleanup: ${deletion}.`, `Run error: ${runError ? String(runError) : 'none'}.`, '',
      '## Files', '', ...[...new Set([...files, ...await readdir(output), 'index.md'])].sort().map(file => `- [${file}](${file})`), '',
      '## Rule failures', '', ...(failures.length ? failures : ['None.']), '',
      '## Ellipses (report only; full text)', '', ...(ellipses.length ? ellipses : ['None.']), '',
    ].join('\n'))
    await testInfo.attach('populated-matrix-index', { path: path.join(output, 'index.md'), contentType: 'text/markdown' })
  }
  if (runError) throw runError
  const offenders = captures.flatMap(row => row.failures.map(f => `${row.page}/${row.state}/${row.theme}/${row.width}: ${f.rule} ${f.selector} ${f.text}`))
  expect(offenders, 'Responsive rule offenders (full selectors/text also in index.md)').toEqual([])
})
