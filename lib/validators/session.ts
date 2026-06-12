import { z } from 'zod'

export const sessionSchema = z.object({
  title: z.string().min(1, 'กรุณาใส่ชื่อรายการ').max(120),
  account_id: z.string().uuid('กรุณาเลือกบัญชี'),
  target_amount_satang: z.number().int().positive().nullable(),
})

export type SessionInput = z.infer<typeof sessionSchema>

// Guest payload — server boundary; ref_code comes from QR, paid_at from OCR/user.
export const guestSlipSchema = z.object({
  amount_satang: z.number().int().positive('จำนวนเงินต้องมากกว่า 0'),
  ref_code: z.string().min(1).max(64).nullable(),
  paid_at: z.string().datetime({ offset: true }),
})

export type GuestSlipInput = z.infer<typeof guestSlipSchema>
