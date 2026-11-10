import { confirmOccurrence } from '@/app/actions/notifications'
import { Button } from '@/components/ui/button'
export default async function ConfirmRecurringPage({ searchParams }: { searchParams: Promise<{ occ?: string }> }) {
  const { occ } = await searchParams
  if (!occ) return <p className="text-muted-foreground">Missing occurrence.</p>
  const occurrenceId = occ
  async function action() { 'use server'; await confirmOccurrence(occurrenceId) }
  return <form action={action} className="space-y-4"><h1 className="text-2xl font-bold">จ่ายแล้วใช่ไหม?</h1><p className="text-muted-foreground">ยืนยันแล้ว รายการจะคงอยู่ในสมุดบัญชี</p><Button type="submit">ยืนยันการจ่าย</Button></form>
}
