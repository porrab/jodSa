import { z } from 'zod'

export const BANKS = [
  'SCB', 'KBank', 'KTB', 'BBL', 'BAY', 'KIATNAKIN', 'CIMB',
  'TTB', 'UOB', 'LH Bank', 'Other',
] as const

export const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  bank: z.string().min(1, 'Bank is required'),
})

export type AccountInput = z.infer<typeof accountSchema>
