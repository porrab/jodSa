import { describe, it, expect } from 'vitest'
import {
  buildLastAccountMap,
  getLastAccountForCategory,
  resolveAccountDefault,
  reapplyAccountDefault,
} from '@/lib/last-account'

describe('buildLastAccountMap', () => {
  it('keeps the first sighting of each category (rows are pre-sorted datetime DESC)', () => {
    const map = buildLastAccountMap([
      { category: 'food',      account_id: 'kbank' }, // latest food
      { category: 'transport', account_id: 'scb' },
      { category: 'food',      account_id: 'ktb' },   // older food — ignored
      { category: 'food',      account_id: 'bbl' },
    ])
    expect(map).toEqual({ food: 'kbank', transport: 'scb' })
  })

  it('skips rows whose category is null (transfers, etc.)', () => {
    const map = buildLastAccountMap([
      { category: null,   account_id: 'kbank' },
      { category: 'food', account_id: 'scb' },
    ])
    expect(map).toEqual({ food: 'scb' })
  })

  it('returns an empty map for no rows', () => {
    expect(buildLastAccountMap([])).toEqual({})
  })
})

describe('getLastAccountForCategory', () => {
  const map = { food: 'kbank', transport: 'scb' }

  it('returns the account id when the category has history', () => {
    expect(getLastAccountForCategory('food', map)).toBe('kbank')
  })

  it('returns null when the category has no history', () => {
    expect(getLastAccountForCategory('shopping', map)).toBeNull()
  })

  it('returns null when no category is given', () => {
    expect(getLastAccountForCategory(undefined, map)).toBeNull()
    expect(getLastAccountForCategory(null, map)).toBeNull()
    expect(getLastAccountForCategory('', map)).toBeNull()
  })
})

describe('resolveAccountDefault — precedence (parsed > per-category > global > fallback)', () => {
  const lastByCategory = { food: 'kbank' }

  it('parsed (slip bank_code match) outranks the per-category default', () => {
    expect(
      resolveAccountDefault({
        category: 'food',
        lastByCategory,
        globalLastAccountId: 'global',
        parsedAccountId: 'scb',
        fallbackAccountId: 'first',
      }),
    ).toBe('scb')
  })

  it('per-category match wins over global last when no parsed account', () => {
    expect(
      resolveAccountDefault({
        category: 'food',
        lastByCategory,
        globalLastAccountId: 'global',
        parsedAccountId: null,
        fallbackAccountId: 'first',
      }),
    ).toBe('kbank')
  })

  it('global last wins over fallback when no per-category history', () => {
    expect(
      resolveAccountDefault({
        category: 'shopping',
        lastByCategory,
        globalLastAccountId: 'global',
        parsedAccountId: null,
        fallbackAccountId: 'first',
      }),
    ).toBe('global')
  })

  it('falls back to the first account when nothing else matches — never blocks', () => {
    expect(
      resolveAccountDefault({
        category: 'shopping',
        lastByCategory: {},
        globalLastAccountId: null,
        parsedAccountId: null,
        fallbackAccountId: 'first',
      }),
    ).toBe('first')
  })

  it('returns null only when the user has no accounts at all', () => {
    expect(
      resolveAccountDefault({
        category: 'food',
        lastByCategory: {},
        globalLastAccountId: null,
        parsedAccountId: null,
        fallbackAccountId: null,
      }),
    ).toBeNull()
  })

  it('an empty / missing category still falls through (no category supplied yet)', () => {
    expect(
      resolveAccountDefault({
        category: undefined,
        lastByCategory,
        globalLastAccountId: 'global',
        parsedAccountId: null,
        fallbackAccountId: 'first',
      }),
    ).toBe('global')
  })
})

describe('resolveAccountDefault — M8 precedence (learned > numberHint > appSignature > parsed > category > global > fallback)', () => {
  const base = {
    category: 'food',
    lastByCategory: { food: 'category-acct' },
    globalLastAccountId: 'global-acct',
    parsedAccountId: 'bank-code-acct',
    fallbackAccountId: 'first-acct',
  }

  it('a learned fingerprint match outranks every other signal', () => {
    expect(
      resolveAccountDefault({
        ...base,
        learnedAccountId: 'learned-acct',
        numberHintAccountId: 'hint-acct',
        appSignatureAccountId: 'app-acct',
      }),
    ).toBe('learned-acct')
  })

  it('a number_hint match outranks app signature and bank code when nothing is learned yet', () => {
    expect(
      resolveAccountDefault({
        ...base,
        learnedAccountId: null,
        numberHintAccountId: 'hint-acct',
        appSignatureAccountId: 'app-acct',
      }),
    ).toBe('hint-acct')
  })

  it('an app-signature match outranks bank code when there is no learned or number_hint match', () => {
    expect(
      resolveAccountDefault({
        ...base,
        learnedAccountId: null,
        numberHintAccountId: null,
        appSignatureAccountId: 'app-acct',
      }),
    ).toBe('app-acct')
  })

  it('bank code (FIELD-3, existing "parsed" tier) still wins over per-category/global/fallback', () => {
    expect(
      resolveAccountDefault({
        ...base,
        learnedAccountId: null,
        numberHintAccountId: null,
        appSignatureAccountId: null,
      }),
    ).toBe('bank-code-acct')
  })

  it('falls through to per-category/global/fallback exactly as before when no M8 signal fires', () => {
    expect(
      resolveAccountDefault({
        ...base,
        parsedAccountId: null,
        learnedAccountId: null,
        numberHintAccountId: null,
        appSignatureAccountId: null,
      }),
    ).toBe('category-acct')
  })

  it('omitting the M8 fields entirely (pre-M8 caller) behaves exactly as before', () => {
    expect(resolveAccountDefault(base)).toBe('bank-code-acct')
  })
})

describe('reapplyAccountDefault — never overwrite a user-touched account field (M8)', () => {
  const opts = {
    category: 'food',
    lastByCategory: { food: 'category-acct' },
    globalLastAccountId: 'global-acct',
    parsedAccountId: 'bank-code-acct',
    fallbackAccountId: 'first-acct',
    learnedAccountId: 'learned-acct',
  }

  it('returns null (do not change) once the user has touched the account select', () => {
    expect(reapplyAccountDefault({ ...opts, touched: true })).toBeNull()
  })

  it('resolves normally (top precedence tier) when the user has not touched it', () => {
    expect(reapplyAccountDefault({ ...opts, touched: false })).toBe('learned-acct')
  })

  it('touched=true blocks even a fresh learned-fingerprint result from a late async lookup', () => {
    // Simulates: initial render resolved from bank code; user then manually picks
    // an account; the async slip_account_map lookup resolves afterwards and must
    // NOT silently swap the user's choice back out.
    expect(
      reapplyAccountDefault({ ...opts, learnedAccountId: 'late-learned-acct', touched: true }),
    ).toBeNull()
  })
})
