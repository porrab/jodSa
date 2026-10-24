'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Plus, Users, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RequiredMark } from '@/components/ui/required-mark'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from '@/components/ui/sheet'
import { createGroup, updateGroup, deleteGroup } from '@/app/actions/groups'
import { formatTHB } from '@/lib/money'
import { PageHeader } from '@/components/ui/page-header'

export type GroupItem = {
  id: string
  title: string
  note: string | null
  spent: number
  count: number
}

function GroupForm({
  defaultValues,
  action,
  onSuccess,
}: {
  defaultValues?: { id: string; title: string; note: string | null }
  action: typeof createGroup | typeof updateGroup
  onSuccess: () => void
}) {
  const t = useTranslations('group')
  const tc = useTranslations('common')
  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      const result = await action(prev, fd)
      if (!result.error) onSuccess()
      else toast.error(result.error)
      return result
    },
    { error: '' },
  )

  return (
    <form action={formAction} className="space-y-4">
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}
      <div className="space-y-1.5">
        <Label htmlFor="title">{t('name')} <RequiredMark /></Label>
        <Input id="title" name="title" required defaultValue={defaultValues?.title} placeholder={t('namePlaceholder')} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">{t('noteOptional')}</Label>
        <Input id="note" name="note" defaultValue={defaultValues?.note ?? ''} placeholder={t('notePlaceholder')} />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? tc('saving') : tc('save')}
      </Button>
    </form>
  )
}

export default function GroupsClient({ groups }: { groups: GroupItem[] }) {
  const t = useTranslations('group')
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm(t('deleteConfirm'))) return
    try {
      await deleteGroup(id)
      toast.success(t('deleted'))
    } catch {
      toast.error(t('deleteFailed'))
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        action={<Button size="sm" onClick={() => setAddOpen(true)}><Plus className="size-4" />{t('add')}</Button>}
      />
      <Sheet open={addOpen} onOpenChange={setAddOpen}>
        <SheetContent side="bottom" className="px-4 pb-8">
          <SheetHeader><SheetTitle>{t('addTitle')}</SheetTitle></SheetHeader>
          <GroupForm action={createGroup} onSuccess={() => setAddOpen(false)} />
        </SheetContent>
      </Sheet>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Users className="mx-auto mb-2 size-6" />
          <p>{t('empty')}</p>
          <p className="text-sm mt-1">{t('emptyHint')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {groups.map((g) => (
            <Link key={g.id} href={`/groups/${g.id}`} className="flex min-h-16 items-center gap-3 px-1 py-3 transition-colors hover:bg-accent/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 font-medium">
                    <span className="truncate">{g.title}</span>
                  </div>
                  {g.note && <p className="truncate text-sm text-muted-foreground">{g.note}</p>}
                  <p className="mt-1 text-sm tabular-nums text-expense">
                    {formatTHB(g.spent)}
                    <span className="ml-1.5 text-sm text-muted-foreground">{t('itemCount', { count: g.count })}</span>
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
