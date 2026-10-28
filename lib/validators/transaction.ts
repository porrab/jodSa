import { z } from 'zod'

export const CATEGORIES = [
  'food', 'transport', 'shopping', 'health', 'entertainment',
  'utilities', 'salary', 'freelance', 'other',
] as const

// Stored/rendered like ordinary categories but never offered by category pickers.
// Invest/divest are transaction types, not categories.
export const SYSTEM_CATEGORIES = ['adjustment'] as const

export const INCOME_CATEGORIES: readonly string[] = ['salary', 'freelance', 'other']
export const EXPENSE_CATEGORIES: readonly string[] = [
  'food', 'transport', 'shopping', 'health', 'entertainment', 'utilities', 'other',
]

export function categoriesForType(type: 'income' | 'expense'): readonly string[] {
  return type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
}

export const transactionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('income'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    category: z.string().optional(),
    counterparty: z.string().max(200).optional(),
    note: z.string().max(120).optional(),
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
    note: z.string().max(120).optional(),
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
    note: z.string().max(120).optional(),
    datetime: z.string().datetime({ offset: true }),
    group_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('invest'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    holding_id: z.string().uuid().optional(),
    note: z.string().max(120).optional(),
    datetime: z.string().datetime({ offset: true }),
  }),
  z.object({
    type: z.literal('divest'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    holding_id: z.string().uuid().optional(),
    note: z.string().max(120).optional(),
    datetime: z.string().datetime({ offset: true }),
  }),
])

export type TransactionInput = z.infer<typeof transactionSchema>

// Update payload — everything editable except `ref_code` (M7-A / design J3: "all
// fields editable except ref_code"). ref_code is the dedup identity for slip
// imports; structurally excluding it here means a crafted request can't smuggle
// a change to it in, not just "the form doesn't render a field for it".
export const transactionUpdateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('income'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    category: z.string().optional(),
    counterparty: z.string().max(200).optional(),
    note: z.string().max(120).optional(),
    datetime: z.string().datetime({ offset: true }),
    group_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('expense'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    category: z.string().optional(),
    counterparty: z.string().max(200).optional(),
    note: z.string().max(120).optional(),
    datetime: z.string().datetime({ offset: true }),
    group_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('transfer'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    to_account_id: z.string().uuid(),
    note: z.string().max(120).optional(),
    datetime: z.string().datetime({ offset: true }),
    group_id: z.string().uuid().optional(),
  }),
  z.object({
    type: z.literal('invest'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    holding_id: z.string().uuid().optional(),
    note: z.string().max(120).optional(),
    datetime: z.string().datetime({ offset: true }),
  }),
  z.object({
    type: z.literal('divest'),
    amount_satang: z.number().int().positive(),
    account_id: z.string().uuid(),
    holding_id: z.string().uuid().optional(),
    note: z.string().max(120).optional(),
    datetime: z.string().datetime({ offset: true }),
  }),
])

export type TransactionUpdateInput = z.infer<typeof transactionUpdateSchema>
