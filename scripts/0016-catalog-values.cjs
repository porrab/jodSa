const assert = require('node:assert/strict')

function plain(value) {
  if (Array.isArray(value)) return Array.from(value, plain)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]))
  return value
}

// pg name[]/text[] may arrive as a native array, Result-like array or text.
// Reject malformed/unsupported encodings rather than weakening catalog checks.
function names(value) {
  if (Array.isArray(value)) return Array.from(value, item => { assert.equal(typeof item, 'string'); return item })
  if (value && typeof value === 'object' && Number.isInteger(value.length) && value.length >= 0) return names(Array.from(value))
  assert.equal(typeof value, 'string', 'CATALOG_ARRAY_EXPECTED')
  assert.match(value, /^\{.*\}$/s, 'CATALOG_ARRAY_ENCODING')
  if (value === '{}') return []
  const tokens = value.slice(1,-1).match(/"(?:\\.|[^"\\])*"|[^,]+/g) ?? []
  const result = tokens.map(token => token.startsWith('"') ? JSON.parse(token) : token)
  assert.equal(tokens.join(','), value.slice(1,-1), 'CATALOG_ARRAY_ENCODING')
  return names(result)
}

function snapshot(raw) {
  return {
    tables: Array.from(raw.tables, row => plain(row)),
    publication: Array.from(raw.publication, row => plain(row)),
    members: Array.from(raw.members, row => typeof row === 'string' ? row : `${row.schemaname}.${row.tablename}`).sort(),
    policies: Array.from(raw.policies, row => ({ ...plain(row), roles: names(row.roles).sort() })),
  }
}

function assertCatalogChanges(beforeRaw, afterRaw) {
  const before = snapshot(beforeRaw), after = snapshot(afterRaw)
  assert.deepEqual(after.tables, before.tables, 'TABLE_SECURITY_OR_IDENTITY_CHANGED')
  assert.deepEqual(after.publication, before.publication, 'PUBLICATION_OPTIONS_CHANGED')
  const targets = new Set(['public.accounts','public.transactions','public.budgets'])
  assert.deepEqual(after.members, before.members.filter(name => !targets.has(name)), 'PUBLICATION_DROP_MISMATCH')
}

module.exports = { plain, names, snapshot, assertCatalogChanges }
