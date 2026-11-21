import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BudgetBar from '@/components/budget-bar'
import HomeBudgetStrip from '@/components/home-budget-strip'
import { daysRemainingInBangkokMonth, type BudgetRow } from '@/lib/budget'
import th from '../../messages/th.json'

const budget: BudgetRow = {
  id: 'monthly', period: 'month', scope: 'overall', category: null, amount_satang: 1_000_000,
}

afterEach(() => vi.useRealTimers())

describe.each([
  ['2026-11-21T12:00:00+07:00', 10, '฿1,000'],
  ['2026-11-30T12:00:00+07:00', 1, '฿10,000'],
] as const)('Home and Budgets on %s', (iso, days, dailyAmount) => {
  it.each([false, true])('show days once in each card (over budget: %s)', (over) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(iso))
    const status = { spent: over ? 2_000_000 : 0, remaining: over ? -1_000_000 : 1_000_000, ratio: over ? 1 : 0, over }
    const cards = [
      createElement(HomeBudgetStrip, { budget, status, monthExpense: status.spent, daysRemaining: daysRemainingInBangkokMonth() }),
      createElement(BudgetBar, { budget, status }),
    ]
    for (const card of cards) {
      const markup = renderToStaticMarkup(createElement(NextIntlClientProvider, { locale: 'th', timeZone: 'Asia/Bangkok', messages: th, children: card }))
      expect(markup.split(`อีก ${days} วัน`)).toHaveLength(2)
      if (!over) expect(markup).toContain(th.dashboard.dailyAllowance.replace('{amount}', dailyAmount))
    }
  })
})
