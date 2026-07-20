import { describe, it, expect } from 'vitest'
import { toDatetimeLocal } from '@/lib/quick-add'

/**
 * SPEC5-1 regression.
 *
 * pm-desk's finding was not just "the datetime was wrong" — it was that
 * `tests/unit/pending-tx.test.ts` is *structurally incapable* of catching it:
 * that suite treats `restore` as an opaque object and asserts identity, so a
 * defect in how the **caller builds** the payload is invisible to it.
 *
 * These tests cover the seam it cannot: a restore value must be re-feedable
 * into the control it will be rendered in. `<input type="datetime-local">`
 * accepts exactly `YYYY-MM-DDTHH:mm` — anything else makes a *required* field
 * render blank, which is the failure mode design v4 F6 rule 4 forbids.
 */

const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

describe('toDatetimeLocal — the value must be usable by the control', () => {
  it('passes an already-valid datetime-local value through unchanged', () => {
    expect(toDatetimeLocal('2026-07-20T23:49')).toBe('2026-07-20T23:49')
  })

  it('trims seconds, which the control tolerates but does not need', () => {
    expect(toDatetimeLocal('2026-07-20T23:49:30')).toBe('2026-07-20T23:49')
  })

  it('THE BUG: a UTC ISO string is converted instead of passed through blank', () => {
    // Exactly what fillFormData writes into the FormData before submit.
    const out = toDatetimeLocal('2026-07-20T16:49:00.000Z')
    expect(out).toMatch(DATETIME_LOCAL)
    // Pre-fix this reached the control verbatim and it rendered nothing.
    expect(out).not.toContain('Z')
    expect(out).not.toContain('.000')
  })

  it('round-trips: local → server ISO → restore returns the SAME local time', () => {
    // This is the real-world path and it is timezone-independent by
    // construction: whatever zone the test runs in, normalising to ISO and back
    // must land on the value the user actually typed.
    for (const typed of [
      '2026-07-20T23:49',
      '2026-01-01T00:00',
      '2026-12-31T23:59',
      '2026-02-28T12:30',
    ]) {
      const serverIso = new Date(typed).toISOString()
      expect(toDatetimeLocal(serverIso)).toBe(typed)
    }
  })

  it('never returns a value the control would reject', () => {
    for (const input of [
      '2026-07-20T23:49',
      '2026-07-20T16:49:00.000Z',
      new Date().toISOString(),
      '2026-07-20T23:49:30',
    ]) {
      const out = toDatetimeLocal(input)
      expect(out, `input: ${input}`).toMatch(DATETIME_LOCAL)
    }
  })

  it('drops unusable input rather than handing the control garbage', () => {
    // A picker with no value still works; one holding a value it cannot parse
    // looks broken and blocks a required field.
    for (const bad of ['', null, undefined, 'not a date', 'ยังไม่ได้เลือก']) {
      expect(toDatetimeLocal(bad)).toBeUndefined()
    }
  })

  it('uses local components, not UTC ones', () => {
    // Guards the obvious "fix" that reintroduces the timezone bug: if this used
    // getUTC*, a Bangkok user's 23:49 would come back as 16:49.
    const typed = '2026-07-20T23:49'
    const back = toDatetimeLocal(new Date(typed).toISOString())
    expect(back).toBe(typed)
    expect(back).not.toBe('2026-07-20T16:49')
  })
})
