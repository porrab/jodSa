'use client'

import { useActionState } from 'react'
import { signupAction } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const initialState = { error: '', success: false }

export default function SignupForm() {
  const [state, formAction, isPending] = useActionState(signupAction, initialState)

  if (state.success) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-4 text-center text-sm">
        <p className="font-medium">ตรวจสอบอีเมลของคุณ</p>
        <p className="text-muted-foreground mt-1">เราส่งลิงก์ยืนยันให้คุณแล้ว</p>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="displayName">ชื่อที่แสดง</Label>
        <Input id="displayName" name="displayName" type="text" autoComplete="name" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="email">อีเมล</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-1">
        <Label htmlFor="password">รหัสผ่าน</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
      </Button>
    </form>
  )
}
