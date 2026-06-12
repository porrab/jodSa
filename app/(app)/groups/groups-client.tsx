'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Users, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import { createGroup, updateGroup, deleteGroup } from '@/app/actions/groups'
import { formatTHB } from '@/lib/money'

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
        <Label htmlFor="title">ชื่อกลุ่ม/ทริป</Label>
        <Input id="title" name="title" required defaultValue={defaultValues?.title} placeholder="เช่น ทริปเชียงใหม่" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="note">บันทึก (ไม่บังคับ)</Label>
        <Input id="note" name="note" defaultValue={defaultValues?.note ?? ''} placeholder="รายละเอียด" />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    </form>
  )
}

export default function GroupsClient({ groups }: { groups: GroupItem[] }) {
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('ลบกลุ่มนี้? รายการที่อยู่ในกลุ่มจะไม่ถูกลบ แต่จะถูกนำออกจากกลุ่ม')) return
    try {
      await deleteGroup(id)
      toast.success('ลบกลุ่มแล้ว')
    } catch {
      toast.error('ไม่สามารถลบได้')
    }
  }

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button><Plus className="size-4 mr-2" />เพิ่มกลุ่ม</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>เพิ่มกลุ่ม/ทริป</DialogTitle></DialogHeader>
          <GroupForm action={createGroup} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {groups.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <Users className="mx-auto mb-2 size-6" />
          <p>ยังไม่มีกลุ่ม</p>
          <p className="text-sm mt-1">จัดกลุ่มรายการเป็นทริปหรือโปรเจกต์ แล้วดูยอดรวม</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.id}>
              <CardContent className="flex items-center gap-2 py-4">
                <Link href={`/groups/${g.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-1 font-medium">
                    <span className="truncate">{g.title}</span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </div>
                  {g.note && <p className="truncate text-xs text-muted-foreground">{g.note}</p>}
                  <p className="mt-1 text-sm tabular-nums text-expense">
                    {formatTHB(g.spent)}
                    <span className="ml-1.5 text-xs text-muted-foreground">{g.count} รายการ</span>
                  </p>
                </Link>
                <div className="flex flex-col gap-1">
                  <Dialog open={editId === g.id} onOpenChange={(o) => setEditId(o ? g.id : null)}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm"><Pencil className="size-3.5" /></Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>แก้ไขกลุ่ม</DialogTitle></DialogHeader>
                      <GroupForm
                        defaultValues={{ id: g.id, title: g.title, note: g.note }}
                        action={updateGroup}
                        onSuccess={() => setEditId(null)}
                      />
                    </DialogContent>
                  </Dialog>
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(g.id)}>
                    <Trash2 className="size-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
