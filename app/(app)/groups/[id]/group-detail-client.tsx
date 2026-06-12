'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { setTransactionGroup } from '@/app/actions/groups'
import { groupExpenseTotal, groupExpenseByCategory } from '@/lib/group'
import { formatTHB } from '@/lib/money'
import type { Database } from '@/lib/supabase/types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']
type Group = Database['public']['Tables']['groups']['Row']

const TYPE_STYLE: Record<string, { label: string; textCls: string; prefix: string }> = {
  income: { label: 'รายรับ', textCls: 'text-income', prefix: '+' },
  expense: { label: 'รายจ่าย', textCls: 'text-expense', prefix: '-' },
  transfer: { label: 'โอนเงิน', textCls: 'text-transfer', prefix: '' },
}

function TxRow({
  tx,
  accountMap,
  action,
  actionIcon,
  onDone,
}: {
  tx: Transaction
  accountMap: Record<string, Account>
  action: () => Promise<void>
  actionIcon: React.ReactNode
  onDone: () => void
}) {
  const [busy, setBusy] = useState(false)
  const acct = accountMap[tx.account_id]
  const style = TYPE_STYLE[tx.type] ?? TYPE_STYLE.expense

  async function run() {
    setBusy(true)
    try {
      await action()
      onDone()
    } catch {
      toast.error('ดำเนินการไม่สำเร็จ')
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {tx.counterparty ?? acct?.name ?? '—'}
          {tx.category && <span className="ml-1.5 text-xs text-muted-foreground">{tx.category}</span>}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(tx.datetime), 'd MMM yyyy HH:mm', { locale: th })}
        </p>
      </div>
      <p className={cn('shrink-0 text-sm font-semibold tabular-nums', style.textCls)}>
        {style.prefix}{formatTHB(tx.amount_satang)}
      </p>
      <Button variant="ghost" size="icon-sm" onClick={run} disabled={busy} className="shrink-0">
        {actionIcon}
      </Button>
    </div>
  )
}

export default function GroupDetailClient({
  group,
  accounts,
  members,
  candidates,
}: {
  group: Group
  accounts: Account[]
  members: Transaction[]
  candidates: Transaction[]
}) {
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  const totalSpent = groupExpenseTotal(members)
  const breakdown = groupExpenseByCategory(members)

  function refresh() {
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link href="/groups"><ChevronLeft className="size-4" /></Link>
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{group.title}</h1>
          {group.note && <p className="truncate text-sm text-muted-foreground">{group.note}</p>}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">ยอดใช้จ่ายรวม</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-3xl font-bold tabular-nums text-expense">{formatTHB(totalSpent)}</p>
          {breakdown.length > 0 && (
            <div className="space-y-1">
              {breakdown.map(([cat, amt]) => (
                <div key={cat} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{cat}</span>
                  <span className="tabular-nums">{formatTHB(amt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">รายการในกลุ่ม ({members.length})</h2>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="size-4 mr-1" />เพิ่มรายการ</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>เพิ่มรายการเข้ากลุ่ม</DialogTitle></DialogHeader>
              {candidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  ไม่มีรายการที่ยังไม่ได้จัดกลุ่ม
                </p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {candidates.map((tx) => (
                    <TxRow
                      key={tx.id}
                      tx={tx}
                      accountMap={accountMap}
                      action={() => setTransactionGroup(tx.id, group.id)}
                      actionIcon={<Plus className="size-3.5" />}
                      onDone={() => { toast.success('เพิ่มเข้ากลุ่มแล้ว'); refresh() }}
                    />
                  ))}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            <p>ยังไม่มีรายการในกลุ่มนี้</p>
            <p className="mt-1 text-sm">กด “เพิ่มรายการ” เพื่อจัดรายการเข้ากลุ่ม</p>
          </div>
        ) : (
          <div className="divide-y rounded-lg border">
            {members.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                accountMap={accountMap}
                action={() => setTransactionGroup(tx.id, null)}
                actionIcon={<X className="size-3.5 text-destructive" />}
                onDone={() => { toast.success('นำออกจากกลุ่มแล้ว'); refresh() }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
