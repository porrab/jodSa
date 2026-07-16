import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * M5 non-goal guard — "No order-execution / broker-integration code path
 * exists anywhere" (roadmap M5 acceptance; SPEC-4 hard constraint). Modeled
 * on the pattern idea-forge's SPEC-3 M10 brief calls for: grep the planner
 * surface for identifiers that would indicate an actual execute/place/submit
 * sink, and assert zero matches.
 *
 * Scope: everywhere the M5 planner's output could plausibly be wired to an
 * action — lib/invest/planner/ (the pure pipeline), the plan Server Action,
 * and the plan UI. NOT a blanket ban on the English words "order"/"execute"/
 * "broker" in prose (the disclaimer legitimately says "never places or
 * simulates an order", and holdings.broker is a legitimate M1 text field
 * elsewhere in the app, outside this surface) — this checks for shaped
 * identifiers a real execution call site would use.
 */
const PLANNER_SURFACE = [
  'lib/invest/planner',
  'app/actions/invest/plan.ts',
  'app/(app)/invest/plan-client.tsx',
]

// Identifier-shaped patterns that would indicate a real execution sink. Case
// insensitive; `\b` boundaries so e.g. "reasonKey" or "brokerApiKey" (neither
// of which appear) wouldn't false-negative past a looser match.
const FORBIDDEN_PATTERNS: RegExp[] = [
  /placeOrder\s*\(/i,
  /executeOrder\s*\(/i,
  /submitOrder\s*\(/i,
  /executeTrade\s*\(/i,
  /placeTrade\s*\(/i,
  /brokerApi/i,
  /broker[-_.]?client/i,
  /order[-_.]?execution/i,
  /trade[-_.]?placement/i,
  /\.trade\s*\(/i,
  /orderClient/i,
]

function collectFilesAbs(abs: string): string[] {
  const st = statSync(abs, { throwIfNoEntry: false })
  if (!st) return []
  if (st.isFile()) return [abs]
  const out: string[] = []
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const full = join(abs, entry.name)
    if (entry.isDirectory()) out.push(...collectFilesAbs(full))
    else if (/\.(ts|tsx|json)$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('M5 non-goal guard — no order-execution / broker-integration code path anywhere', () => {
  const files = PLANNER_SURFACE.flatMap((p) => collectFilesAbs(join(process.cwd(), p)))

  it('found at least the expected planner files (guard is actually scanning something)', () => {
    expect(files.length).toBeGreaterThanOrEqual(8) // types/resolve/allocation/concentration/stress/plan/verdict/tags + action + UI
  })

  it('none of the planner-surface files contain an execution-shaped identifier', () => {
    const hits: string[] = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.test(content)) hits.push(`${file}: ${pattern}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('the Suggestion action union only ever offers buy/sell/hold — no "execute" variant', () => {
    const typesFile = readFileSync(join(process.cwd(), 'lib/invest/planner/types.ts'), 'utf8')
    const match = typesFile.match(/SuggestionAction = ([^\n]+)/)
    expect(match).not.toBeNull()
    expect(match![1]).toBe("'buy' | 'sell' | 'hold'")
  })
})
