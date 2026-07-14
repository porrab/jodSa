import { z } from 'zod'

export const ASSET_CLASSES = ['us_equity', 'etf', 'thai_set', 'thai_fund', 'gold', 'crypto'] as const
export type AssetClass = (typeof ASSET_CLASSES)[number]

export const SLEEVES = ['core', 'satellite', 'risk_capital'] as const
export type Sleeve = (typeof SLEEVES)[number]

export const ASSET_TX_TYPES = ['buy', 'sell', 'dividend', 'fee'] as const
export type AssetTxType = (typeof ASSET_TX_TYPES)[number]

// A short curated list for the currency picker — not exhaustive; any 3-letter ISO
// code validates, this just drives the <Select> options for the common cases.
export const CURRENCIES = ['THB', 'USD', 'EUR', 'JPY'] as const

const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter ISO 4217 code')

/** Creating a custom (user-scoped) asset when nothing in the seeded reference list matches. */
export const customAssetSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  symbol: z.string().max(20).optional(),
  assetClass: z.enum(ASSET_CLASSES),
  currency: currencySchema,
  region: z.string().max(50).optional(),
})
export type CustomAssetInput = z.infer<typeof customAssetSchema>

/** Opening a new holding — always paired with its first `buy` transaction (see cost-basis.ts). */
export const holdingCreateSchema = z.object({
  assetId: z.string().uuid('Pick an asset'),
  sleeve: z.enum(SLEEVES).default('core'),
  broker: z.string().max(50).optional(),
  qty: z.number().positive('Quantity must be greater than 0'),
  price: z.number().nonnegative('Price cannot be negative'),
  currency: currencySchema,
  fees: z.number().nonnegative().default(0),
  fxRate: z.number().positive().optional(),
  datetime: z.string().min(1, 'Date is required'),
  ref: z.string().max(100).optional(),
})
export type HoldingCreateInput = z.infer<typeof holdingCreateSchema>

/** Recording a buy/sell/dividend/fee against an existing holding. */
export const assetTransactionSchema = z
  .object({
    holdingId: z.string().uuid(),
    type: z.enum(ASSET_TX_TYPES),
    qty: z.number().positive().optional(),
    // Buy/sell: per-unit price. Dividend/fee: total cash amount (same field, see migration comment).
    amount: z.number().nonnegative(),
    currency: currencySchema,
    fees: z.number().nonnegative().default(0),
    fxRate: z.number().positive().optional(),
    datetime: z.string().min(1, 'Date is required'),
    ref: z.string().max(100).optional(),
  })
  .refine((v) => (v.type === 'buy' || v.type === 'sell' ? v.qty !== undefined && v.qty > 0 : true), {
    message: 'Quantity is required for buy/sell',
    path: ['qty'],
  })
export type AssetTransactionInput = z.infer<typeof assetTransactionSchema>

export const updateHoldingSchema = z.object({
  id: z.string().uuid(),
  sleeve: z.enum(SLEEVES),
  broker: z.string().max(50).optional(),
  currentValue: z.number().nonnegative().optional(),
  currentValueCurrency: currencySchema.optional(),
  currentFxToDisplay: z.number().positive().optional(),
})
export type UpdateHoldingInput = z.infer<typeof updateHoldingSchema>

// ── M3 — Portfolio Dashboard ─────────────────────────────────────────────

/** One row of the "update prices" bulk form (app/actions/invest/portfolio.ts). */
export const bulkPriceUpdateEntrySchema = z.object({
  holdingId: z.string().uuid(),
  currentValue: z.number().nonnegative('Value cannot be negative'),
  currentValueCurrency: currencySchema,
  // Required only when currentValueCurrency isn't the display currency (THB) —
  // enforced by the caller (lib/invest/portfolio.ts DISPLAY_CURRENCY), not here,
  // since this schema doesn't know the display currency.
  currentFxToDisplay: z.number().positive().optional(),
})
export type BulkPriceUpdateEntry = z.infer<typeof bulkPriceUpdateEntrySchema>

export const bulkPriceUpdateSchema = z.array(bulkPriceUpdateEntrySchema).min(1, 'Nothing to update')
