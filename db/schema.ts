import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  numeric,
  jsonb,
  boolean,
  timestamp,
  date,
} from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  displayName: text('display_name'),
  locale: text('locale').default('th').notNull(),
  theme: text('theme').default('system').notNull(),
})

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  bank: text('bank').notNull(),
  qrImagePath: text('qr_image_path'),
  // Starting balance of the account (satang). NOT a transaction — kept off
  // income/expense/transfer/budget analysis; only seeds computeAccountBalance.
  openingBalanceSatang: integer('opening_balance_satang').notNull().default(0),
  // M8: optional user-entered last visible digits ("เลขท้ายบัญชี", design J4).
  // Disambiguates same-bank accounts (e.g. 3 KTB accounts) via
  // lib/account-map.ts matchAccountByNumberHint() against a slip's sender mask.
  numberHint: text('number_hint'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const transactions = pgTable('transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: text('type', { enum: ['income', 'expense', 'transfer'] }).notNull(),
  amountSatang: integer('amount_satang').notNull(),
  accountId: uuid('account_id').notNull(),
  toAccountId: uuid('to_account_id'),
  category: text('category'),
  refCode: text('ref_code'),
  bankCode: text('bank_code'),
  counterparty: text('counterparty'),
  datetime: timestamp('datetime', { withTimezone: true }).notNull(),
  groupId: uuid('group_id'),
  recurringRuleId: uuid('recurring_rule_id'),
  occurrenceDate: date('occurrence_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Partial unique index for ref_code is defined in the SQL migration (WHERE ref_code IS NOT NULL)

export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: text('title').notNull(),
  note: text('note'),
})

export const recurringRules = pgTable('recurring_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: text('type', { enum: ['income', 'expense'] }).notNull(),
  amountSatang: integer('amount_satang').notNull(),
  category: text('category'),
  accountId: uuid('account_id').notNull(),
  freq: text('freq', { enum: ['weekly', 'monthly', 'yearly'] }).notNull(),
  interval: integer('interval').default(1).notNull(),
  byWeekday: integer('by_weekday').array(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  // Guard date added by 0006_perf_balance_rpc_materialize_guard.sql — was missing
  // here (schema.ts/supabase types had drifted; lib/supabase/types.ts already had
  // it). Backfilled for consistency while touching this table for M7-D.
  materializedThrough: date('materialized_through'),
})

export const recurringExceptions = pgTable('recurring_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  ruleId: uuid('rule_id').notNull(),
  skippedDate: date('skipped_date').notNull(),
})

export const budgets = pgTable('budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  period: text('period', { enum: ['day', 'month'] }).notNull(),
  scope: text('scope', { enum: ['overall', 'category'] }).notNull(),
  category: text('category'),
  amountSatang: integer('amount_satang').notNull(),
})

export const paymentSessions = pgTable('payment_sessions', {
  id: text('id').primaryKey(), // nanoid capability token
  owner: uuid('owner').notNull(),
  accountId: uuid('account_id'), // null for trip sessions (no single receiving account)
  title: text('title').notNull(),
  targetAmountSatang: integer('target_amount_satang'),
  type: text('type', { enum: ['collect', 'trip'] }).default('collect').notNull(),
  status: text('status', { enum: ['open', 'closed'] }).default('open').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sessionParticipants = pgTable('session_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id').notNull(),
  nickname: text('nickname').notNull(),
  participantToken: text('participant_token').notNull(),
  userId: uuid('user_id'),
  isOwner: boolean('is_owner').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sessionExpenses = pgTable('session_expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id').notNull(),
  payerParticipantId: uuid('payer_participant_id').notNull(),
  title: text('title').notNull(),
  totalAmountSatang: integer('total_amount_satang').notNull(),
  splitAmong: integer('split_among').notNull(),
  qrImagePath: text('qr_image_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// M8: learned fingerprint → account mapping (the account-mapping learning loop).
// fingerprint = `bank_code|app_signature|sender_mask` (lib/account-map.ts).
// account_id is overwritten to the latest confirmed/corrected choice per
// fingerprint — a correction immediately takes over future auto-selects.
export const slipAccountMap = pgTable('slip_account_map', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  fingerprint: text('fingerprint').notNull(),
  accountId: uuid('account_id').notNull(),
  hits: integer('hits').default(1).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
// UNIQUE(user_id, fingerprint) is defined in the SQL migration.

// ── M1 (SPEC-4) — JodSa Investments: holdings + asset-transaction ledger ──────────
// See db/migrations/0008_invest_holdings.sql for the full design rationale
// (bigint minor units, no redundant avg-cost column — cost basis is always derived
// live from asset_transactions via lib/invest/cost-basis.ts).

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  symbol: text('symbol'),
  name: text('name').notNull(),
  assetClass: text('asset_class', {
    enum: ['us_equity', 'etf', 'thai_set', 'thai_fund', 'gold', 'crypto'],
  }).notNull(),
  region: text('region'),
  currency: text('currency').notNull(),
  // Nullable — a key into the app-shipped proxy-params, consumed only by the later M5 planner.
  proxyClass: text('proxy_class'),
  // Nullable — ETF constituents/sector weights (best-effort), consumed only by M5.
  lookthrough: jsonb('lookthrough'),
  isSystem: boolean('is_system').default(false).notNull(),
  userId: uuid('user_id'), // null for system-seeded rows
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const holdings = pgTable('holdings', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  assetId: uuid('asset_id').notNull(),
  sleeve: text('sleeve', { enum: ['core', 'satellite', 'risk_capital'] })
    .default('core')
    .notNull(),
  broker: text('broker'),
  // Manually-entered "current value" (M3 "update prices"); null until the user sets it.
  currentValueMinor: bigint('current_value_minor', { mode: 'bigint' }),
  currentValueCurrency: text('current_value_currency'),
  // FX-at-valuation used to roll this holding into the display-currency total —
  // entered by the user, never fetched.
  currentFxToDisplay: numeric('current_fx_to_display'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const assetTransactions = pgTable('asset_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  holdingId: uuid('holding_id').notNull(),
  type: text('type', { enum: ['buy', 'sell', 'dividend', 'fee'] }).notNull(),
  // buy/sell: traded quantity. dividend/fee: null (price_minor holds the total amount).
  qty: numeric('qty'),
  // buy/sell: PER-UNIT price. dividend/fee: TOTAL cash amount (column reused; see migration).
  priceMinor: bigint('price_minor', { mode: 'bigint' }),
  currency: text('currency').notNull(),
  feesMinor: bigint('fees_minor', { mode: 'bigint' }).default(0n).notNull(),
  // FX-at-cost: display-currency-per-unit-of-`currency`, captured at trade time, immutable.
  fxRate: numeric('fx_rate'),
  datetime: timestamp('datetime', { withTimezone: true }).notNull(),
  ref: text('ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const portfolioSnapshots = pgTable('portfolio_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  takenAt: timestamp('taken_at', { withTimezone: true }).defaultNow().notNull(),
  displayCurrency: text('display_currency').notNull(),
  holdings: jsonb('holdings').notNull(), // valued positions as of the snapshot
  totals: jsonb('totals').notNull(), // value / cost / P&L in display currency
  allocation: jsonb('allocation').notNull(), // by asset_class / currency / sleeve
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const sessionSlips = pgTable('session_slips', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: text('session_id').notNull(),
  amountSatang: integer('amount_satang').notNull(),
  refCode: text('ref_code'),
  paidAt: timestamp('paid_at', { withTimezone: true }).notNull(),
  confirmed: boolean('confirmed').default(false).notNull(),
  expenseId: uuid('expense_id'),
  payerParticipantId: uuid('payer_participant_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})
