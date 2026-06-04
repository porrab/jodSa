import { z } from 'zod'

export const CATEGORIES = [
  'food', 'transport', 'shopping', 'health', 'entertainment',
  'utilities', 'salary', 'freelance', 'other',
] as const

export const transactionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('income'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    category: z.string().optional(),
    counterparty: z.string().max(200).optional(),
    datetime: z.string().datetime({ offset: true }),
    ref_code: z.string().max(100).optional(),
    bank_code: z.string().max(20).optional(),
    group_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('expense'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    category: z.string().optional(),
    counterparty: z.string().max(200).optional(),
    datetime: z.string().datetime({ offset: true }),
    ref_code: z.string().max(100).optional(),
    bank_code: z.string().max(20).optional(),
    group_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('transfer'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    to_account_id: z.string().uuid(),
    datetime: z.string().datetime({ offset: true }),
    group_id: z.string().uuid().optional(),
  }),
])

export type TransactionInput = z.infer<typeof transactionSchema>
