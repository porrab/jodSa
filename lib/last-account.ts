export type LastAccountMap = Record<string, string>

export interface LastAccountRow {
  category: string | null
  account_id: string
}

/**
 * Build a {category → most-recent account_id} map from a list of the user's
 * income/expense rows ordered datetime DESC. Each category keeps its first
 * (latest) sighting; rows without a category are skipped.
 */
export function buildLastAccountMap(rows: LastAccountRow[]): LastAccountMap {
  const map: LastAccountMap = {}
  for (const r of rows) {
    if (r.category && !(r.category in map)) {
      map[r.category] = r.account_id
    }
  }
  return map
}

export function getLastAccountForCategory(
  category: string | null | undefined,
  map: LastAccountMap,
): string | null {
  if (!category) return null
  return map[category] ?? null
}

/**
 * Resolve which account_id to pre-fill in the log form (M8 extends the
 * precedence — the earlier tiers here are new, the tail is unchanged):
 *
 *   learned fingerprint (slip_account_map) → number_hint match → app signature
 *   → parsed (slip bank_code match, FIELD-3) → per-category last → global last
 *   → fallback (accounts[0])
 *
 * Manual override is handled by the caller — only call this for the initial
 * value or while the user has not touched the account select (see
 * `reapplyAccountDefault` below for the "never overwrite user-touched" guard).
 *
 * Transfer's to_account_id must never be auto-set — callers in transfer mode
 * must not invoke this for the destination side.
 */
export function resolveAccountDefault(opts: {
  category?: string | null
  lastByCategory: LastAccountMap
  globalLastAccountId: string | null
  parsedAccountId: string | null
  fallbackAccountId: string | null
  // M8 — all optional so pre-M8 callers/tests are unaffected.
  learnedAccountId?: string | null
  numberHintAccountId?: string | null
  appSignatureAccountId?: string | null
}): string | null {
  return (
    opts.learnedAccountId ||
    opts.numberHintAccountId ||
    opts.appSignatureAccountId ||
    opts.parsedAccountId ||
    getLastAccountForCategory(opts.category, opts.lastByCategory) ||
    opts.globalLastAccountId ||
    opts.fallbackAccountId
  )
}

/**
 * Re-apply the resolver only if the user has not manually touched the account
 * select yet (M8). Used whenever a new signal arrives AFTER the initial
 * render — the async learned-fingerprint lookup resolving, or a category
 * change — so a user's manual pick (or their confirmation of an auto-pick) is
 * never silently overwritten. Returns null when touched, meaning "leave
 * accountId exactly as it is" — callers should only call setAccountId when
 * this returns a truthy value.
 */
export function reapplyAccountDefault(
  opts: Parameters<typeof resolveAccountDefault>[0] & { touched: boolean },
): string | null {
  if (opts.touched) return null
  return resolveAccountDefault(opts)
}
