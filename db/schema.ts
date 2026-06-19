import {
  pgTable,
  uuid,
  text,
  integer,
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
