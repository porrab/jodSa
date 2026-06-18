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
 * Resolve which account_id to pre-fill in the log form.
 *
 *   parsed (slip bank_code match) → per-category last → global last → fallback
 *
 * Manual override is handled by the caller — only call this for the initial
 * value or while the user has not touched the account select.
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
}): string | null {
  return (
    opts.parsedAccountId ||
    getLastAccountForCategory(opts.category, opts.lastByCategory) ||
    opts.globalLastAccountId ||
    opts.fallbackAccountId
  )
}
