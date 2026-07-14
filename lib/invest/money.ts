/**
 * Multi-currency money helpers for the /invest module — SEPARATE from lib/money.ts
 * (JodSa's THB/satang-only helpers), per the SPEC-4 Fable build-readiness review.
 *
 * Every monetary DB column here is `bigint` (int8), not `integer` (int4) — JodSa's
 * satang columns cap out around ฿21.4M, too small for multi-currency portfolios.
 * PostgREST returns int8 as a STRING over JSON (a JS `number` can't hold a full
 * int64 precisely), so every helper here accepts `string | number | bigint` on the
 * way in and returns a plain `bigint` for arithmetic — convert back to `string`
 * with `minorToApi()` immediately before a supabase-js insert/update (JSON.stringify
 * throws on a raw bigint).
 *
 * No floats for money, ever. `decimal.js` is intentionally NOT a dependency here —
 * M1 doesn't need ratio math (that's the later M5 planner); everything below is
 * exact integer/bigint arithmetic with a single, explicit rounding point.
 */

// Minor-unit exponent per ISO-4217 currency. Extend as new currencies are needed;
// unlisted currencies default to 2 (matches the overwhelming majority of ISO 4217).
const MINOR_UNIT_DECIMALS: Record<string, number> = {
  THB: 2,
  USD: 2,
  EUR: 2,
  JPY: 0,
  // Crypto isn't ISO-4217, but this module prices crypto holdings *in* a fiat
  // currency (see assets seed: BTC/ETH/USDT all carry currency='USD') — qty holds
  // the fractional coin amount, price_minor/current_value_minor stay fiat-minor.
}

export function minorUnitDecimals(currency: string): number {
  return MINOR_UNIT_DECIMALS[currency.toUpperCase()] ?? 2
}

/** Parse a value coming back from PostgREST (string) or already-bigint into a bigint. Null/undefined → 0n. */
export function parseMinor(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError(`parseMinor: non-finite number ${value}`)
    return BigInt(Math.round(value))
  }
  const trimmed = value.trim()
  if (trimmed === '') return 0n
  return BigInt(trimmed)
}

/** Convert a bigint minor amount to a `string` safe for a supabase-js insert/update. */
export function minorToApi(minor: bigint): string {
  return minor.toString()
}

/** Convert a user-typed major-unit amount ("1,234.56") to minor units for a given currency. */
export function toMinor(major: number, currency: string): bigint {
  const decimals = minorUnitDecimals(currency)
  const scaled = major * 10 ** decimals
  if (!Number.isFinite(scaled)) throw new RangeError(`toMinor: non-finite result for ${major} ${currency}`)
  return BigInt(Math.round(scaled))
}

/** Convert minor units back to a major-unit number for display/formatting. */
export function toMajor(minor: bigint, currency: string): number {
  const decimals = minorUnitDecimals(currency)
  return Number(minor) / 10 ** decimals
}

/**
 * Parse a user-typed amount string → minor units. Accepts "1,234.56", "1234.56", "1234".
 * Returns null if invalid or non-positive (mirrors lib/money.ts's parseInputToSatang).
 */
export function parseInputToMinor(input: string, currency: string): bigint | null {
  if (!input?.trim()) return null
  const cleaned = input.replace(/,/g, '').replace(/\s/g, '').trim()
  const value = parseFloat(cleaned)
  if (isNaN(value) || value <= 0) return null
  return toMinor(value, currency)
}

export function formatMoney(
  minor: string | number | bigint | null | undefined,
  currency: string,
  locale = 'th-TH',
): string {
  const major = toMajor(parseMinor(minor), currency)
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: minorUnitDecimals(currency),
      maximumFractionDigits: minorUnitDecimals(currency),
    }).format(major)
  } catch {
    // Unknown ISO code to Intl (e.g. a currency we don't recognize) — fall back to a
    // plain number + currency code suffix rather than throwing.
    return `${major.toFixed(minorUnitDecimals(currency))} ${currency.toUpperCase()}`
  }
}

/** Read a numeric field off a FormData submission ("1,234.56" etc.) → number, or NaN if blank/invalid. */
export function parseFormNumber(formData: FormData, key: string): number {
  const raw = (formData.get(key) as string | null)?.trim()
  if (!raw) return NaN
  return parseFloat(raw.replace(/,/g, '').replace(/\s/g, ''))
}

export function addMinor(a: bigint, b: bigint): bigint {
  return a + b
}

export function subMinor(a: bigint, b: bigint): bigint {
  return a - b
}

/**
 * FX-at-cost / FX-at-valuation conversion: convert a minor amount in `fromCurrency`
 * into `toCurrency` using a stored (entered, never fetched) rate expressed as
 * "1 unit of fromCurrency = `rate` units of toCurrency". Rounds once, at the
 * destination currency's minor-unit boundary — this is the fixture-pinned rounding
 * point referenced by the M1 acceptance test.
 */
export function convertMinor(minor: bigint, rate: number, fromCurrency: string, toCurrency: string): bigint {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError(`convertMinor: invalid fx rate ${rate}`)
  }
  const majorFrom = toMajor(minor, fromCurrency)
  const majorTo = majorFrom * rate
  return toMinor(majorTo, toCurrency)
}
