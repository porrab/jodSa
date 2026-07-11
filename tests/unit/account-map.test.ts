import { describe, it, expect } from 'vitest'
import {
  buildFingerprint,
  hasFingerprintSignal,
  matchAccountByNumberHint,
  matchAccountByAppSignature,
} from '@/lib/account-map'

describe('buildFingerprint', () => {
  it('joins bank_code|app_signature|sender_mask, lowercased', () => {
    expect(buildFingerprint({ bankCode: 'KTB', sourceApp: 'paotang', senderMask: '441-5' })).toBe(
      'ktb|paotang|441-5',
    )
  })

  it('normalizes missing/null/undefined parts to empty string', () => {
    expect(buildFingerprint({ bankCode: 'KTB', sourceApp: null, senderMask: undefined })).toBe('ktb||')
    expect(buildFingerprint({})).toBe('||')
  })

  it('trims whitespace before lowercasing', () => {
    expect(buildFingerprint({ bankCode: ' KTB ', sourceApp: undefined, senderMask: undefined })).toBe(
      'ktb||',
    )
  })
})

describe('hasFingerprintSignal', () => {
  it('is false for an all-empty fingerprint ("||")', () => {
    expect(hasFingerprintSignal('||')).toBe(false)
  })

  it('is true when at least one part is non-empty', () => {
    expect(hasFingerprintSignal('ktb||')).toBe(true)
    expect(hasFingerprintSignal('||441-5')).toBe(true)
    expect(hasFingerprintSignal('|paotang|')).toBe(true)
  })
})

describe('matchAccountByNumberHint', () => {
  const accounts = [
    { id: 'krungthai', name: 'krungthai', number_hint: '4415' },
    { id: 'mrt', name: 'Mrt', number_hint: '9021' },
    { id: 'paotang', name: 'Paotang', number_hint: null },
  ]

  it('matches an account whose number_hint digits match the sender mask digits exactly', () => {
    expect(matchAccountByNumberHint('441-5', accounts)).toBe('krungthai')
  })

  it('matches when the hint is a trailing substring of the mask digits (user typed only last digits)', () => {
    // hint "021" is a suffix of mask digits "9021"
    const partial = [{ id: 'mrt', name: 'Mrt', number_hint: '021' }]
    expect(matchAccountByNumberHint('9021', partial)).toBe('mrt')
  })

  it('does not match a different account\'s hint', () => {
    expect(matchAccountByNumberHint('9021', accounts)).toBe('mrt')
    expect(matchAccountByNumberHint('4415', accounts)).toBe('krungthai')
  })

  it('returns null when the sender mask is null/absent', () => {
    expect(matchAccountByNumberHint(null, accounts)).toBeNull()
    expect(matchAccountByNumberHint(undefined, accounts)).toBeNull()
  })

  it('returns null when no account has a matching hint (including accounts with no hint set)', () => {
    expect(matchAccountByNumberHint('1234', accounts)).toBeNull()
  })

  it('ignores hints/masks shorter than 3 digits to avoid trivial false positives', () => {
    const shortHint = [{ id: 'a', name: 'A', number_hint: '5' }]
    expect(matchAccountByNumberHint('5', shortHint)).toBeNull()
  })
})

describe('matchAccountByAppSignature', () => {
  const accounts = [
    { id: 'krungthai', name: 'krungthai' },
    { id: 'mrt', name: 'Mrt' },
    { id: 'paotang-acct', name: 'Paotang' },
    { id: 'make-acct', name: 'make' },
    { id: 'kbank-card', name: 'Kbank บัตร' },
  ]

  it('matches the account literally named after the detected app (motivating case: Paotang)', () => {
    expect(matchAccountByAppSignature('paotang', accounts)).toBe('paotang-acct')
  })

  it('matches the account named "make", not the other KBank account (motivating case)', () => {
    expect(matchAccountByAppSignature('make', accounts)).toBe('make-acct')
  })

  it('is case-insensitive on the account name', () => {
    expect(matchAccountByAppSignature('paotang', [{ id: 'x', name: 'PAOTANG WALLET' }])).toBe('x')
  })

  it('returns null when sourceApp is null/undefined', () => {
    expect(matchAccountByAppSignature(null, accounts)).toBeNull()
    expect(matchAccountByAppSignature(undefined, accounts)).toBeNull()
  })

  it('returns null when no account name carries a recognizable hint', () => {
    expect(matchAccountByAppSignature('kplus', accounts)).toBeNull()
  })
})
