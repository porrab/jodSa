'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import TransactionForm from '@/components/transaction-form'
import { deleteTransaction } from '@/app/actions/transactions'
import type { Database } from '@/lib/supabase/types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']

const TYPE_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  income: { label: 'รายรับ', variant: 'default' },
  expense: { label: 'รายจ่าย', variant: 'destructive' },
  transfer: { label: 'โอนเงิน', variant: 'secondary' },
}

export default function TransactionsClient({
  transactions,
  accounts,
  formatTHB,
}: {
  transactions: Transaction[]
  accounts: Account[]
  formatTHB: (satang: number) => string
}) {
  const [addOpen, setAddOpen] = useState(false)
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  async function handleDelete(id: string) {
    if (!confirm('ลบรายการนี้?')) return
    try {
      await deleteTransaction(id)
      toast.success('ลบรายการแล้ว')
    } catch {
      toast.error('ไม่สามารถลบรายการได้')
    }
  }

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button><Plus className="size-4 mr-2" />เพิ่มรายการ</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>เพิ่มรายการใหม่</DialogTitle></DialogHeader>
          <TransactionForm
            accounts={accounts}
            onSuccess={() => setAddOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {transactions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>ยังไม่มีรายการ</p>
          <p className="text-sm mt-1">เพิ่มรายการแรกของคุณ</p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {transactions.map((tx) => {
            const acct = accountMap[tx.account_id]
            const toAcct = tx.to_account_id ? accountMap[tx.to_account_id] : null
            const badge = TYPE_BADGE[tx.type] ?? TYPE_BADGE.expense

            return (
              <div key={tx.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={badge.variant} className="text-xs">
                      {badge.label}
                    </Badge>
                    {tx.category && (
                      <span className="text-xs text-muted-foreground">{tx.category}</span>
                    )}
                  </div>
                  <p className="text-sm mt-0.5 truncate">
                    {tx.counterparty ?? (toAcct ? `→ ${toAcct.name}` : acct?.name ?? '—')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(tx.datetime), 'd MMM yyyy HH:mm', { locale: th })}
                    {acct && <> · {acct.name}</>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`font-semibold tabular-nums text-sm ${
                    tx.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' :
                    tx.type === 'expense' ? 'text-destructive' : ''
                  }`}>
                    {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                    {formatTHB(tx.amount_satang)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(tx.id)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
