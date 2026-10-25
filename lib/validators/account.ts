import { z } from 'zod'

export const BANKS = [
  'SCB', 'KBank', 'KTB', 'BBL', 'BAY', 'KIATNAKIN', 'CIMB',
  'TTB', 'UOB', 'LH Bank', 'Other',
] as const

export type BankCode = (typeof BANKS)[number]

export const BANK_LABEL_KEYS: Record<BankCode, string> = {
  SCB: 'scb',
  KBank: 'kbank',
  KTB: 'ktb',
  BBL: 'bbl',
  BAY: 'bay',
  KIATNAKIN: 'kiatnakin',
  CIMB: 'cimb',
  TTB: 'ttb',
  UOB: 'uob',
  'LH Bank': 'lhBank',
  Other: 'other',
}

export const accountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  bank: z.string().min(1, 'Bank is required'),
  // M8: optional last-visible-digits hint ("เลขท้ายบัญชี", design J4). Free text —
  // matched against a slip's extracted sender mask by digit run, not validated
  // against a mask shape (see lib/account-map.ts matchAccountByNumberHint).
  number_hint: z.string().max(20).optional(),
})

export type AccountInput = z.infer<typeof accountSchema>
