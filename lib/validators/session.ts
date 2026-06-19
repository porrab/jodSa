import { z } from 'zod'

export const sessionSchema = z.object({
  title: z.string().min(1, 'กรุณาใส่ชื่อรายการ').max(120),
  account_id: z.string().uuid('กรุณาเลือกบัญชี'),
  target_amount_satang: z.number().int().positive().nullable(),
})

export type SessionInput = z.infer<typeof sessionSchema>

// ── Trip sessions ─────────────────────────────────────────────────────────────

// Anonymous join: just a nickname. The participant_token is minted server-side.
export const joinSchema = z.object({
  nickname: z.string().trim().min(1, 'กรุณาใส่ชื่อเล่น').max(40),
})
export type JoinInput = z.infer<typeof joinSchema>

// A trip expense someone fronted. The QR image arrives separately (multipart);
// this validates the JSON-coercible fields only.
export const tripExpenseSchema = z.object({
  participant_token: z.string().min(1).max(64),
  title: z.string().trim().min(1, 'กรุณาใส่ชื่อรายการ').max(120),
  total_amount_satang: z.number().int().positive('จำนวนเงินต้องมากกว่า 0'),
  split_among: z.number().int().positive('จำนวนคนต้องมากกว่า 0').max(99),
})
export type TripExpenseInput = z.infer<typeof tripExpenseSchema>

// A slip a participant sends toward a specific trip expense.
export const tripSlipSchema = z.object({
  participant_token: z.string().min(1).max(64),
  expense_id: z.string().uuid(),
  amount_satang: z.number().int().positive('จำนวนเงินต้องมากกว่า 0'),
  ref_code: z.string().min(1).max(64).nullable(),
  paid_at: z.string().datetime({ offset: true }),
})
export type TripSlipInput = z.infer<typeof tripSlipSchema>

// Guest payload — server boundary; ref_code comes from QR, paid_at from OCR/user.
export const guestSlipSchema = z.object({
  amount_satang: z.number().int().positive('จำนวนเงินต้องมากกว่า 0'),
  ref_code: z.string().min(1).max(64).nullable(),
  paid_at: z.string().datetime({ offset: true }),
})

export type GuestSlipInput = z.infer<typeof guestSlipSchema>
