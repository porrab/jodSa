import type { SourceApp } from '@/lib/slip/types'

export interface MappableAccount {
  id: string
  name: string
  number_hint?: string | null
}

/**
 * Fingerprint a slip's identifying signals into a single string:
 * `bank_code|app_signature|sender_mask` (all lowercased, empties normalized to
 * ''). Stored as the key of `slip_account_map` (M8) — the learned association
 * between "a slip that looks like this" and the account the user confirmed.
 */
export function buildFingerprint(parts: {
  bankCode?: string | null
  sourceApp?: string | null
  senderMask?: string | null
}): string {
  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase()
  return [norm(parts.bankCode), norm(parts.sourceApp), norm(parts.senderMask)].join('|')
}

/**
 * A fingerprint of all-empty parts ("||") carries no identifying signal — every
 * slip with no detected bank/app/mask would collide on it. Never look up or
 * record a mapping for it; without this guard a user with many unidentifiable
 * slips would have them all "learn" toward whichever account was saved last.
 */
export function hasFingerprintSignal(fingerprint: string): boolean {
  return fingerprint !== '' && fingerprint.replace(/\|/g, '') !== ''
}

function digitsOnly(s: string): string {
  return s.replace(/[^0-9]/g, '')
}

/**
 * Match a slip's sender mask against each account's user-entered number_hint
 * (design J4, "เลขท้ายบัญชี"). Compares digit runs only — a hint of "441-5" and
 * a mask of "441-5" both normalize to "4415" — and accepts a hint that is a
 * trailing substring of the mask (a user may type only the last 3–4 digits).
 * Requires at least 3 digits in the hint to avoid trivial false positives.
 */
export function matchAccountByNumberHint<T extends MappableAccount>(
  senderMask: string | null | undefined,
  accounts: T[],
): string | null {
  const maskDigits = digitsOnly(senderMask ?? '')
  if (maskDigits.length < 3) return null
  for (const a of accounts) {
    const hintDigits = digitsOnly(a.number_hint ?? '')
    if (hintDigits.length >= 3 && maskDigits.endsWith(hintDigits)) return a.id
  }
  return null
}

// Name substrings a user is likely to type for each app when naming an account
// (the motivating case: accounts literally named "Paotang"/"make"/"Kbank บัตร").
// There is no accounts.app_signature column (M8 only adds number_hint) — this
// is a best-effort heuristic on the free-text account name, same spirit as the
// existing FIELD-3 bank-field match.
const APP_NAME_HINTS: Record<SourceApp, string[]> = {
  paotang: ['paotang', 'เป๋าตัง', 'g-wallet'],
  make: ['make'],
  kplus: ['k+', 'kplus', 'k plus'],
  ktbnext: ['next', 'ktb next', 'กรุงไทย next'],
  ttb: ['ttb', 'touch'],
}

/**
 * Match a slip's detected source app against each account's name (case-
 * insensitive substring). Returns null when no app was detected or no account
 * name carries a recognizable hint — callers fall through to the next
 * precedence tier (bank code) rather than blocking.
 */
export function matchAccountByAppSignature<T extends MappableAccount>(
  sourceApp: SourceApp | null | undefined,
  accounts: T[],
): string | null {
  if (!sourceApp) return null
  const hints = APP_NAME_HINTS[sourceApp] ?? []
  if (hints.length === 0) return null
  for (const a of accounts) {
    const name = a.name.toLowerCase()
    if (hints.some((h) => name.includes(h))) return a.id
  }
  return null
}
