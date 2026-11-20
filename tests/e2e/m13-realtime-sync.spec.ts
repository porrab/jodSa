import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { env, e2eBaseUrl } from './helpers/env'
import { findUserByEmail, testUserClient } from './helpers/admin'
import { login } from './helpers/ui'
import { formatMoney } from '@/lib/invest/money'

// Quarantined 2026-11-20 (RV-UX-4): intermittent on base a643b50 and later
// (Overview total not refreshed within 2200ms). Pre-existing; root cause unproven. Do not patch
// framework internals; re-enable when the refresh path is investigated.
test.fixme('RV-M13-4 invest overview refreshes with its permanent inline form', async ({ browser }) => {
  const user = await findUserByEmail(env.userA.email)
  if (!user) throw new Error('Missing A')
  const db = await testUserClient(user.id)
  const { data: asset, error: assetError } = await db.from('assets').select('id').eq('is_system', true).eq('symbol', 'PTT').single()
  if (assetError) throw assetError
  const { data: account, error: accountError } = await db.from('accounts').insert({ user_id: user.id, name: `M13-inline-${Date.now()}`, bank: 'SCB' }).select('id').single()
  if (accountError) throw accountError
  let holdingId = ''
  const context = await browser.newContext({ baseURL: e2eBaseUrl })
  try {
    const { data: holding, error } = await db.from('holdings').insert({ user_id: user.id, asset_id: asset.id, sleeve: 'core' }).select('id').single()
    if (error) throw error
    holdingId = holding.id
    const buy = (amount: number) => db.rpc('record_buy_with_cash', {
      p_holding_id: holdingId, p_qty: 1, p_price_minor: String(amount), p_currency: 'THB',
      p_fees_minor: '0', p_fx_rate: null, p_datetime: new Date().toISOString(), p_ref: null,
      p_account_id: account.id, p_amount_satang: amount,
    })
    expect((await buy(10000)).error).toBeNull()
    const page = await context.newPage()
    await login(page, env.userA.email, env.userA.password)
    await page.goto('/invest')
    await page.getByRole('tab', { name: 'ภาพรวม', exact: true }).click()
    await expect(page.locator('form').filter({ has: page.getByRole('button', { name: 'บันทึกสแนปช็อต' }) })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => performance.getEntriesByName('m13-realtime-ready').length)).toBeGreaterThan(0)
    const total = page.locator('.text-4xl').first()
    const before = BigInt((await total.innerText()).replace(/[^\d-]/g, ''))
    let navigations = 0
    page.on('request', request => { if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigations++ })
    // The RPC changes the portfolio cost and emits the real transactions/accounts Broadcast.
    expect((await buy(12345)).error).toBeNull()
    await expect(total).toHaveText(formatMoney(before + 12345n, 'THB'), { timeout: 2200 })
    expect(navigations).toBe(0)
  } finally {
    if (holdingId) {
      expect((await db.from('transactions').delete().eq('holding_id', holdingId)).error).toBeNull()
      expect((await db.from('asset_transactions').delete().eq('holding_id', holdingId)).error).toBeNull()
      expect((await db.from('holdings').delete().eq('id', holdingId)).error).toBeNull()
    }
    expect((await db.from('accounts').delete().eq('id', account.id)).error).toBeNull()
    await context.close()
  }
})

test('M13 A-to-A add/edit/delete, offline reconcile and form deferral without reload', async ({ browser }) => {
  test.setTimeout(180000)
  const user = await findUserByEmail(env.userA.email); if (!user) throw new Error('Missing A')
  const db = await testUserClient(user.id)
  const label = `M13-${Date.now()}`
  const { data: account, error } = await db.from('accounts').insert({ user_id:user.id,name:label,bank:'SCB' }).select('id').single(); if(error) throw error
  const writerContext = await browser.newContext({baseURL:e2eBaseUrl})
  const readerContext = await browser.newContext({baseURL:e2eBaseUrl})
  const writer = await writerContext.newPage(), reader = await readerContext.newPage()
  let txId = '', warmId = ''
  try {
    for (const page of [writer,reader]) {
      await login(page,env.userA.email,env.userA.password)
      await page.goto('/transactions')
      await expect.poll(()=>page.evaluate(()=>performance.getEntriesByName('m13-realtime-ready').length)).toBeGreaterThan(0)
    }
    const warm = await db.from('transactions').insert({user_id:user.id,account_id:account.id,type:'expense',amount_satang:1,datetime:new Date().toISOString(),note:`${label}-warm`}).select('id').single()
    if(warm.error) throw warm.error
    warmId = warm.data.id
    await expect(reader.getByTestId(`transaction-${warmId}`)).toBeVisible()
    expect((await db.from('transactions').delete().eq('id',warmId)).error).toBeNull()
    await expect(reader.getByTestId(`transaction-${warmId}`)).toHaveCount(0)
    let navigations=0
    reader.on('request',request=>{if(request.isNavigationRequest() && request.frame()===reader.mainFrame()) navigations++})
    await writer.getByRole('button',{name:'เพิ่ม',exact:true}).click()
    const form = writer.getByRole('dialog')
    await form.locator('#quick-add-amount').fill('91.23')
    await form.getByRole('button',{name:'+ ตั้งชื่อที่แสดงเอง',exact:true}).click()
    await form.locator('#quick-add-note').fill(label)
    await form.getByRole('radio',{name:new RegExp(`^${label},`)}).click()
    await form.getByRole('button',{name:'บันทึกรายการ',exact:true}).click()
    await expect.poll(async()=>{ const {data}=await db.from('transactions').select('id').eq('account_id',account.id).eq('note',label); txId=data?.[0]?.id??''; return txId }).not.toBe('')
    const row = reader.getByTestId(`transaction-${txId}`)
    await expect(row).toContainText('91.23',{timeout:2200})
    await writer.getByTestId(`transaction-${txId}`).click()
    await writer.getByRole('dialog').getByRole('button',{name:'แก้ไข',exact:true}).click()
    await writer.getByRole('dialog').locator('input[name="amount"]').fill('99.98')
    await writer.getByRole('dialog').getByRole('button',{name:'บันทึกรายการ',exact:true}).click()
    await expect(row).toContainText('99.98',{timeout:2200})
    // A visible form/sheet must hold a queued refresh until it closes.
    await reader.getByRole('button',{name:'เพิ่ม',exact:true}).click()
    expect((await db.from('transactions').update({amount_satang:8800}).eq('id',txId)).error).toBeNull()
    await reader.waitForTimeout(1000)
    await expect(row).toContainText('99.98')
    await reader.keyboard.press('Escape')
    await expect(row).toContainText('88.00',{timeout:2200})
    await readerContext.setOffline(true)
    expect((await db.from('transactions').update({amount_satang:7700}).eq('id',txId)).error).toBeNull()
    await readerContext.setOffline(false)
    await expect(row).toContainText('77.00',{timeout:5000}); await expect(row).toHaveCount(1)
    writer.once('dialog',dialog=>dialog.accept())
    await writer.getByTestId(`transaction-${txId}`).click()
    await writer.getByRole('dialog').getByRole('button',{name:'ลบรายการ',exact:true}).click()
    await expect(row).toHaveCount(0,{timeout:2200})
    expect(navigations).toBe(0)
  } finally {
    if(txId) await db.from('transactions').delete().eq('id',txId)
    if(warmId) await db.from('transactions').delete().eq('id',warmId)
    await db.from('accounts').delete().eq('id',account.id)
    await Promise.allSettled([writerContext.close(),readerContext.close()])
  }
})

test('M13 realtime has a separate chunk requested only after hydration', async ({ browser }) => {
  const root = path.resolve('.next/static/chunks')
  const chunks = fs.readdirSync(root,{recursive:true}).map(String).filter(file=>file.endsWith('.js') && fs.readFileSync(path.join(root,file),'utf8').includes('m13-realtime-sync'))
  expect(chunks).toHaveLength(1)
  const file = chunks[0].replaceAll('\\','/')
  const context = await browser.newContext({baseURL:e2eBaseUrl})
  const auth=await context.newPage(); await login(auth,env.userA.email,env.userA.password); await auth.close()
  const page=await context.newPage(); const requests:string[]=[]
  let release!:()=>void; const paused=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/_next/static/chunks/**',async route=>{await paused; await route.continue()})
  page.on('request',request=>requests.push(request.url()))
  try {
    await page.goto('/transactions',{waitUntil:'domcontentloaded'})
    expect(requests.some(url=>url.includes(file))).toBe(false)
    release()
    await expect.poll(()=>requests.some(url=>url.includes(file))).toBe(true)
    await expect.poll(()=>page.evaluate(()=>performance.getEntriesByName('m13-realtime-sync').length)).toBeGreaterThan(0)
    await test.info().attach('lazy-chunk',{body:JSON.stringify({chunk:file,absentBeforeHydration:true}),contentType:'application/json'})
  } finally { release(); await context.close() }
})
