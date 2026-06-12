import { z } from 'zod'

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'รูปแบบวันที่ไม่ถูกต้อง')

export const recurringRuleSchema = z
  .object({
    type: z.enum(['income', 'expense']),
    amount_satang: z.number().int().positive(),
    category: z.string().optional(),
    account_id: z.string().uuid(),
    freq: z.enum(['weekly', 'monthly', 'yearly']),
    interval: z.number().int().min(1).max(99),
    by_weekday: z.array(z.number().int().min(1).max(7)).optional(),
    start_date: ymd,
    end_date: ymd.optional(),
  })
  .refine((r) => !r.end_date || r.end_date >= r.start_date, {
    message: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม',
    path: ['end_date'],
  })

export type RecurringRuleInput = z.infer<typeof recurringRuleSchema>

export const FREQ_LABELS: Record<'weekly' | 'monthly' | 'yearly', string> = {
  weekly: 'รายสัปดาห์',
  monthly: 'รายเดือน',
  yearly: 'รายปี',
}

// ISO weekday Mon=1 .. Sun=7
export const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'จ.' },
  { value: 2, label: 'อ.' },
  { value: 3, label: 'พ.' },
  { value: 4, label: 'พฤ.' },
  { value: 5, label: 'ศ.' },
  { value: 6, label: 'ส.' },
  { value: 7, label: 'อา.' },
]
