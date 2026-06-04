'use client'

import { useActionState, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { createAccount, updateAccount, deleteAccount } from '@/app/actions/accounts'
import { BANKS } from '@/lib/validators/account'
import { formatTHB } from '@/lib/money'

type Account = {
  id: string
  name: string
  bank: string
  balance: number
}

function AccountForm({
  defaultValues,
  action,
  onSuccess,
}: {
  defaultValues?: { name: string; bank: string; id?: string }
  action: typeof createAccount | typeof updateAccount
  onSuccess: () => void
}) {
  const [bank, setBank] = useState(defaultValues?.bank ?? '')
  const [state, formAction, isPending] = useActionState(
    async (prev: { error: string }, fd: FormData) => {
      if (bank) fd.set('bank', bank)
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
      <div className="space-y-1">
        <Label htmlFor="name">ชื่อบัญชี</Label>
        <Input id="name" name="name" defaultValue={defaultValues?.name} required />
      </div>
      <div className="space-y-1">
        <Label>ธนาคาร</Label>
        <Select value={bank} onValueChange={setBank} required>
          <SelectTrigger>
            <SelectValue placeholder="เลือกธนาคาร" />
          </SelectTrigger>
          <SelectContent>
            {BANKS.map((b) => (
              <SelectItem key={b} value={b}>{b}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'กำลังบันทึก...' : 'บันทึก'}
      </Button>
    </form>
  )
}

export default function AccountsClient({
  accounts,
}: {
  accounts: Account[]
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm('ลบบัญชีนี้? รายการทั้งหมดที่เชื่อมกับบัญชีนี้จะถูกลบด้วย')) return
    try {
      await deleteAccount(id)
      toast.success('ลบบัญชีแล้ว')
    } catch (e) {
      toast.error('ไม่สามารถลบบัญชีได้')
    }
  }

  return (
    <div className="space-y-4">
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogTrigger asChild>
          <Button><Plus className="size-4 mr-2" />เพิ่มบัญชี</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>เพิ่มบัญชีใหม่</DialogTitle></DialogHeader>
          <AccountForm action={createAccount} onSuccess={() => setAddOpen(false)} />
        </DialogContent>
      </Dialog>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          <p>ยังไม่มีบัญชี</p>
          <p className="text-sm mt-1">เพิ่มบัญชีแรกของคุณเพื่อเริ่มบันทึกรายการ</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((acct) => {
            const editAccount = accounts.find((a) => a.id === editId)
            return (
              <Card key={acct.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{acct.name}</span>
                    <div className="flex gap-1">
                      <Dialog open={editId === acct.id} onOpenChange={(o) => setEditId(o ? acct.id : null)}>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon-sm">
                            <Pencil className="size-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>แก้ไขบัญชี</DialogTitle></DialogHeader>
                          <AccountForm
                            defaultValues={{ id: acct.id, name: acct.name, bank: acct.bank }}
                            action={updateAccount}
                            onSuccess={() => setEditId(null)}
                          />
                        </DialogContent>
                      </Dialog>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(acct.id)}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary" className="mb-2">{acct.bank}</Badge>
                  <p className={`text-lg font-semibold tabular-nums ${acct.balance < 0 ? 'text-destructive' : ''}`}>
                    {formatTHB(acct.balance)}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
