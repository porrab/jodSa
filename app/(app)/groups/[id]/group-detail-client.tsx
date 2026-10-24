'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { CategoryLabel } from '@/lib/categories'
import { toast } from 'sonner'
import { ChevronLeft, Plus, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import { th, enUS } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { setTransactionGroup, updateGroup, deleteGroup } from '@/app/actions/groups'
import { groupExpenseTotal, groupExpenseByCategory, UNCATEGORIZED } from '@/lib/group'
import { formatTHB } from '@/lib/money'
import { transactionAmountPrefix } from '@/components/transaction-type-indicator'
import { TransactionTypeBadge } from '@/components/transaction-type-indicator'
import TransactionRowCopy from '@/components/transaction-row-copy'
import { formatAppDateTime } from '@/lib/date-display'
import type { Database } from '@/lib/supabase/types'

type Transaction = Database['public']['Tables']['transactions']['Row']
type Account = Database['public']['Tables']['accounts']['Row']
type Group = Database['public']['Tables']['groups']['Row']

const TYPE_STYLE: Record<string, { textCls: string }> = {
  income: { textCls: 'text-income' },
  expense: { textCls: 'text-expense' },
  transfer: { textCls: 'text-transfer' },
}

function TxRow({
  tx,
  accountMap,
  action,
  actionIcon,
  actionLabel,
  onDone,
}: {
  tx: Transaction
  accountMap: Record<string, Account>
  action: () => Promise<void>
  actionIcon: React.ReactNode
  actionLabel: string
  onDone: () => void
}) {
  const t = useTranslations('group')
  const locale = useLocale()
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const acct = accountMap[tx.account_id]
  const style = TYPE_STYLE[tx.type] ?? TYPE_STYLE.expense

  async function run() {
    setBusy(true)
    try {
      await action()
      onDone()
      setOpen(false)
    } catch {
      toast.error(t('actionFailed'))
      setBusy(false)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent/40">
        <TransactionTypeBadge type={tx.type} label={tx.type} />
        <div className="min-w-0 flex-1">
          <TransactionRowCopy
            tx={tx}
            accountName={acct?.name}
            time={format(new Date(tx.datetime), 'HH:mm', { locale: locale === 'th' ? th : enUS })}
          />
        </div>
        <p className={cn('shrink-0 text-sm font-semibold tabular-nums', style.textCls)}>
          {transactionAmountPrefix(tx.type)}{formatTHB(tx.amount_satang)}
        </p>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl">
          <SheetHeader><SheetTitle>{tx.counterparty ?? (tx.category ? <CategoryLabel value={tx.category} /> : '—')}</SheetTitle></SheetHeader>
          <div className="space-y-5 px-4 pb-6">
            <p className={cn('text-center text-3xl font-bold tabular-nums', style.textCls)}>{transactionAmountPrefix(tx.type)}{formatTHB(tx.amount_satang)}</p>
            <p className="text-center text-sm text-muted-foreground">{formatAppDateTime(tx.datetime, locale === 'th' ? 'th' : 'en')}</p>
            <Button variant="outline" className="w-full" onClick={run} disabled={busy}>{actionIcon}{actionLabel}</Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
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
  const t = useTranslations('group')
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const accountMap = Object.fromEntries(accounts.map((a) => [a.id, a]))

  const totalSpent = groupExpenseTotal(members)
  const breakdown = groupExpenseByCategory(members)

  function refresh() {
    router.refresh()
  }
  const [editState, editAction, editPending] = useActionState(async (prev: { error: string }, fd: FormData) => {
    const result = await updateGroup(prev, fd)
    if (!result.error) { setEditOpen(false); refresh() }
    return result
  }, { error: '' })

  async function handleDeleteGroup() {
    if (!confirm(t('deleteConfirm'))) return
    await deleteGroup(group.id)
    router.push('/groups')
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
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEditOpen(true)}><Pencil className="size-4" />{t('edit')}</Button>
      </div>

      <Card className="rounded-none border-x-0 shadow-none">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('totalSpent')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-3xl font-bold tabular-nums text-expense">{formatTHB(totalSpent)}</p>
          {breakdown.length > 0 && (
            <div className="space-y-1">
              {breakdown.map(([cat, amt]) => (
                <div key={cat} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{cat === UNCATEGORIZED ? t('uncategorized') : <CategoryLabel value={cat} />}</span>
                  <span className="tabular-nums">{formatTHB(amt)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">{t('memberHeading', { count: members.length })}</h2>
          <Sheet open={addOpen} onOpenChange={setAddOpen}>
            <SheetTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="size-4 mr-1" />{t('addMember')}</Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto px-4 pb-8">
              <SheetHeader><SheetTitle>{t('addMemberTitle')}</SheetTitle></SheetHeader>
              {candidates.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t('noCandidates')}
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {candidates.map((tx) => (
                    <TxRow
                      key={tx.id}
                      tx={tx}
                      accountMap={accountMap}
                      action={() => setTransactionGroup(tx.id, group.id)}
                      actionIcon={<Plus className="size-3.5" />}
                      actionLabel={t('addMember')}
                      onDone={() => { toast.success(t('addedToGroup')); refresh() }}
                    />
                  ))}
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>

        {members.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
            <p>{t('noMembers')}</p>
            <p className="mt-1 text-sm">{t('noMembersHint')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {members.map((tx) => (
              <TxRow
                key={tx.id}
                tx={tx}
                accountMap={accountMap}
                action={() => setTransactionGroup(tx.id, null)}
                actionIcon={null}
                actionLabel={t('removeFromGroup')}
                onDone={() => { toast.success(t('removedFromGroup')); refresh() }}
              />
            ))}
          </div>
        )}
      </div>
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl">
          <SheetHeader><SheetTitle>{t('edit')}</SheetTitle></SheetHeader>
          <form action={editAction} className="space-y-4 px-4 pb-6">
            <input type="hidden" name="id" value={group.id} />
            <div className="space-y-1"><Label htmlFor="group-title">{t('name')}</Label><Input id="group-title" name="title" required defaultValue={group.title} /></div>
            <div className="space-y-1"><Label htmlFor="group-note">{t('noteOptional')}</Label><Input id="group-note" name="note" defaultValue={group.note ?? ''} /></div>
            {editState.error && <p className="text-sm text-destructive">{editState.error}</p>}
            <Button type="submit" className="w-full" disabled={editPending}>{t('edit')}</Button>
            <button type="button" onClick={handleDeleteGroup} className="text-sm text-destructive hover:underline">{t('deleteAction')}</button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
