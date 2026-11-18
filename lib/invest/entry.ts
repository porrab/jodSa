import { tradeTotalMinor } from './cost-basis'
import { convertMinor, minorUnitDecimals, toMinor } from './money'

export function validFx(fx: string): boolean {
  return /^\d+(\.\d+)?$/.test(fx.trim()) && Number.isFinite(Number(fx)) && Number(fx) > 0
}

/** Positive decimal input; never accept parseFloat's partially valid strings. */
function amount(value: string): number | null {
  const text = value.replace(/,/g, '').trim()
  if (!/^\d+(\.\d*)?$/.test(text)) return null
  const n = Number(text)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** FX means THB per asset unit. Divide exactly, rounding half up once. */
export function feeFromBaht(fee: string, fx: string, currency: string): bigint | null {
  const value = amount(fee || '0')
  if (value === null || !validFx(fx)) return null
  const [whole, fraction = ''] = fx.trim().split('.')
  const scale = 10n ** BigInt(fraction.length)
  const rate = BigInt(whole + fraction)
  const numerator = toMinor(value, 'THB') * scale * 10n ** BigInt(minorUnitDecimals(currency))
  const denominator = rate * 100n
  return (numerator * 2n + denominator) / (denominator * 2n)
}

export function entryCheck(type: 'buy' | 'sell', qty: string, price: string, fees: string, currency: string, fx: string) {
  const q = amount(qty), p = amount(price), f = amount(fees || '0')
  if (q === null || q <= 0 || p === null || p <= 0 || f === null) return null
  const minor = tradeTotalMinor(type, q, toMinor(p, currency), toMinor(f, currency))
  return { minor, baht: currency === 'THB' ? minor : validFx(fx) ? convertMinor(minor, Number(fx), currency, 'THB') : null }
}
