import { createClient } from '@/lib/supabase/server'
import { materializeOccurrences } from '@/lib/recurrence/materialize'
import { currentMonthRange } from '@/lib/recurrence/range'
import { buildLastAccountMap } from '@/lib/last-account'
import { budgetStatus, type BudgetRow, type ExpenseRow } from '@/lib/budget'
import HomeTodayList from '@/components/home-today-list'
import HomeBudgetStrip from '@/components/home-budget-strip'
import HomeMoneyHeader from '@/components/home-money-header'
import { valueCurrentHolding } from '@/lib/invest/portfolio'

/**
 * Home — J1 "one glance + one action" (design v3, replaces the old
 * dashboard-as-home). No chart, no gradient hero, no mascot block, no
 * account list, no shortcuts grid: quick-add + today's transactions only.
 * Budget status is a single plain-text line linking to งบ (charts + full
 * budget bars live there now, per J6). Keeping this route Recharts-free is
 * itself an M9 acceptance criterion — do not import the chart components here.
 */
export default async function DashboardPage() {
  const supabase = await createClient()

  const now = new Date()
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
  const todayStart = `${todayStr}T00:00:00+07:00`
  const todayEnd = `${todayStr}T23:59:59.999+07:00`
  const month = todayStr.slice(0, 7)
  const monthStart = `${month}-01T00:00:00+07:00`

  // The refetch pass must attach an AbortSignal: Next memoizes identical GET
  // fetches within one render, so without it a re-run after materialization
  // would be handed the pre-insert response instead of hitting Supabase again.
  const fetchData = (fresh = false) => {
    const today = supabase
      .from('transactions')
      .select('*')
      .gte('datetime', todayStart)
      .lte('datetime', todayEnd)
      .order('datetime', { ascending: false })
    // This month's income/expense — feeds both the budget one-liner and the
    // per-category last-used-account default the detail sheet's edit form uses.
    const monthTx = supabase
      .from('transactions')
      .select('amount_satang, category, datetime, account_id, type')
      .in('type', ['income', 'expense'])
      .gte('datetime', monthStart)
      .order('datetime', { ascending: false })
    return Promise.all([
      fresh ? today.abortSignal(new AbortController().signal) : today,
      fresh ? monthTx.abortSignal(new AbortController().signal) : monthTx,
    ])
  }

  const { from: matFrom, to: matTo } = currentMonthRange(now)
  const [[{ data: accounts }, { data: budgets }, { data: balances }, holdingsResult, assetsResult, assetTransactionsResult], mat, first] = await Promise.all([
    Promise.all([
      supabase.from('accounts').select('*').order('created_at'),
      supabase.from('budgets').select('*'),
      supabase.rpc('account_balances'),
      supabase.from('holdings').select('id, asset_id, broker, current_value_minor, current_value_currency, current_fx_to_display, updated_at').order('created_at'),
      supabase.from('assets').select('id, name, symbol'),
      supabase.from('asset_transactions').select('holding_id, type, qty, price_minor, fees_minor, datetime').order('datetime'),
    ]),
    materializeOccurrences(matFrom, matTo),
    fetchData(),
  ])
  const [{ data: todayTx }, { data: monthTx }] = mat.inserted ? await fetchData(true) : first

  const balanceByAccount = new Map((balances ?? []).map((b) => [b.account_id, b.balance_satang]))
  const totalBalance = (accounts ?? []).reduce(
    (sum, acct) => sum + (balanceByAccount.get(acct.id) ?? acct.opening_balance_satang ?? 0),
    0,
  )
  const assetById = new Map((assetsResult.data ?? []).map((asset) => [asset.id, asset]))
  const transactionsByHolding = new Map<string, NonNullable<typeof assetTransactionsResult.data>>()
  for (const transaction of assetTransactionsResult.data ?? []) {
    const transactions = transactionsByHolding.get(transaction.holding_id) ?? []
    transactions.push(transaction)
    transactionsByHolding.set(transaction.holding_id, transactions)
  }
  const homeAccounts = (accounts ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    bank: account.bank,
    balance: balanceByAccount.get(account.id) ?? account.opening_balance_satang ?? 0,
  }))
  const homeHoldings = (holdingsResult.data ?? []).flatMap((holding) => {
    const asset = assetById.get(holding.asset_id)
    const valuation = valueCurrentHolding(
      {
        currentValueMinor: holding.current_value_minor,
        currentValueCurrency: holding.current_value_currency,
        currentFxToDisplay: holding.current_fx_to_display,
      },
      (transactionsByHolding.get(holding.id) ?? []).map((transaction) => ({
        type: transaction.type,
        qty: transaction.qty,
        priceMinor: transaction.price_minor,
        feesMinor: transaction.fees_minor,
        datetime: transaction.datetime,
      })),
    )
    if (valuation.qty === 0) return []
    return [{
      id: holding.id,
      name: asset?.name ?? '—',
      symbol: asset?.symbol ?? null,
      broker: holding.broker,
      valueMinor: valuation.valueMinor?.toString() ?? null,
      updatedAt: holding.updated_at,
    }]
  })
  const investmentTotal = homeHoldings.reduce(
    (sum, holding) => sum + BigInt(holding.valueMinor ?? '0'),
    0n,
  )
  const investmentsFailed = holdingsResult.error !== null || assetsResult.error !== null || assetTransactionsResult.error !== null

  const monthExpense = (monthTx ?? [])
    .filter((r) => r.type === 'expense')
    .reduce((s, r) => s + r.amount_satang, 0)

  const monthlyBudgetItems = ((budgets ?? []) as BudgetRow[])
    .filter((budget) => budget.period === 'month')
    .map((budget) => ({
      budget,
      status: budgetStatus(budget, (monthTx ?? []) as ExpenseRow[], now),
    }))
  const homeBudgetItem = monthlyBudgetItems.find(({ budget }) => budget.scope === 'overall')
    ?? monthlyBudgetItems
      .filter(({ budget }) => budget.scope === 'category')
      .sort((a, b) => b.status.ratio - a.status.ratio)[0]
    ?? null
  const [year, monthNumber, day] = todayStr.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const daysRemaining = daysInMonth - day + 1

  const lastByCategory = buildLastAccountMap(monthTx ?? [])
  const globalLastAccountId = monthTx?.[0]?.account_id ?? null

  return (
    <div data-testid="home-layout" className="flex min-h-[755px] flex-col md:min-h-0 md:gap-6">
      <section data-testid="home-hero" className="h-[324px] shrink-0 px-5 pb-2 pt-4 md:h-auto md:p-0">
        <HomeMoneyHeader
          cashTotal={totalBalance}
          investmentTotal={investmentTotal.toString()}
          accounts={homeAccounts}
          holdings={homeHoldings}
          investmentsFailed={investmentsFailed}
        />
      </section>

      <section data-testid="home-budget" className="h-[150px] shrink-0 border-y border-border px-5 pb-2 pt-4 md:h-auto md:border-0 md:p-0">
        <HomeBudgetStrip
          budget={homeBudgetItem?.budget ?? null}
          status={homeBudgetItem?.status ?? null}
          monthExpense={monthExpense}
          daysRemaining={daysRemaining}
        />
      </section>

      <section data-testid="home-today" className="min-h-[281px] flex-1 px-5 pb-6 pt-4 md:p-0">
        <HomeTodayList
          transactions={todayTx ?? []}
          accounts={accounts ?? []}
          lastByCategory={lastByCategory}
          globalLastAccountId={globalLastAccountId}
        />
      </section>
    </div>
  )
}
