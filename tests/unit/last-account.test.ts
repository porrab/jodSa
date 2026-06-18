import { describe, it, expect } from 'vitest'
import {
  buildLastAccountMap,
  getLastAccountForCategory,
  resolveAccountDefault,
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
