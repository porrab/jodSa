import { createClient } from '@/lib/supabase/server'
import { formatTHB, computeAccountBalance } from '@/lib/money'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { startOfMonth, endOfMonth } from 'date-fns'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()

  const now = new Date()
  const monthStart = startOfMonth(now).toISOString()
  const monthEnd = endOfMonth(now).toISOString()

  const [{ data: accounts }, { data: allTx }, { data: monthTx }] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.from('transactions').select('type, amount_satang, account_id, to_account_id'),
    supabase
      .from('transactions')
      .select('type, amount_satang')
      .gte('datetime', monthStart)
      .lte('datetime', monthEnd),
  ])

  const totalBalance = (accounts ?? []).reduce(
    (sum, acct) =>
      sum +
      computeAccountBalance(
        (allTx ?? []) as Parameters<typeof computeAccountBalance>[0],
        acct.id,
      ),
    0,
  )

  const monthIncome = (monthTx ?? [])
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + t.amount_satang, 0)

  const monthExpense = (monthTx ?? [])
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + t.amount_satang, 0)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">ภาพรวม</h1>

      {/* Net balance */}
      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">ยอดรวมทุกบัญชี</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={`text-3xl font-bold tabular-nums ${totalBalance < 0 ? 'text-destructive' : ''}`}>
            {formatTHB(totalBalance)}
          </p>
        </CardContent>
      </Card>

      {/* This month summary */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">รายรับเดือนนี้</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-income">
              +{formatTHB(monthIncome)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">รายจ่ายเดือนนี้</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-expense">
              -{formatTHB(monthExpense)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Account balances */}
      {(accounts ?? []).length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">บัญชี</h2>
            <Link href="/accounts" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              ดูทั้งหมด <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="rounded-lg border divide-y">
            {(accounts ?? []).map((acct) => {
              const bal = computeAccountBalance(
                (allTx ?? []) as Parameters<typeof computeAccountBalance>[0],
                acct.id,
              )
              return (
                <div key={acct.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{acct.name}</p>
                    <Badge variant="secondary" className="text-xs mt-0.5">{acct.bank}</Badge>
                  </div>
                  <p className={`text-sm font-semibold tabular-nums ${bal < 0 ? 'text-destructive' : ''}`}>
                    {formatTHB(bal)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* M3: budgets +/- here */}
      {/* M5: Recharts charts here */}
    </div>
  )
}
