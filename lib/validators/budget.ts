import { z } from 'zod'

export const budgetSchema = z
  .object({
    period: z.enum(['day', 'month']),
    scope: z.enum(['overall', 'category']),
    category: z.string().optional(),
    amount_satang: z.number().int().positive(),
  })
  .refine((b) => b.scope !== 'category' || !!b.category, {
    message: 'กรุณาเลือกหมวดหมู่',
    path: ['category'],
  })

export type BudgetInput = z.infer<typeof budgetSchema>

export const PERIOD_LABELS: Record<'day' | 'month', string> = {
  day: 'รายวัน',
  month: 'รายเดือน',
}
