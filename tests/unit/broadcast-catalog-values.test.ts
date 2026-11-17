import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const { snapshot, names, assertCatalogChanges } = require('../../scripts/0016-catalog-values.cjs')
class Result<T> extends Array<T> {}
const result = <T>(...rows: T[]) => new Result<T>(...rows)
function catalogs() {
  const before = {
    tables: result({ relname: 'accounts', relrowsecurity: true, relreplident: 'd' }),
    publication: result({ puballtables: false, pubinsert: true }),
    members: result({ schemaname: 'public', tablename: 'accounts' }, { schemaname: 'realtime', tablename: 'messages' }),
    policies: result({ roles: result('authenticated'), cmd: 'SELECT' }),
  }
  const after = { ...before, members: result({ schemaname: 'realtime', tablename: 'messages' }) }
  return { before, after }
}
it('normalizes Result subclasses, nested arrays and rows to plain values', () => {
  const { before, after } = catalogs()
  expect(snapshot(before)).toStrictEqual({ tables: [{ relname:'accounts', relrowsecurity:true, relreplident:'d' }], publication:[{ puballtables:false, pubinsert:true }], members:['public.accounts','realtime.messages'], policies:[{ roles:['authenticated'],cmd:'SELECT' }] })
  expect(() => assertCatalogChanges(before, after)).not.toThrow()
  expect(() => assertCatalogChanges(before, JSON.parse(JSON.stringify(after)))).not.toThrow()
  expect(() => assertCatalogChanges({ ...before, members: result() }, { ...after, members: [] })).not.toThrow()
})
it.each(['{authenticated}','{"authenticated"}'])('normalizes pg name[] text %s', value => { expect(names(value)).toStrictEqual(['authenticated']) })
it('normalizes array-like roles without accepting additional roles', () => {
  expect(names({0:'authenticated',length:1})).toStrictEqual(['authenticated'])
  expect(names('{authenticated,anon}')).not.toStrictEqual(['authenticated'])
})
it.each(['tables','publication','members'] as const)('still rejects actual %s changes', field => {
  const { before, after } = catalogs()
  const wrong = { ...after, [field]: field === 'tables' ? result({ relname:'accounts',relrowsecurity:false,relreplident:'d' }) : field === 'publication' ? result({puballtables:true,pubinsert:true}) : result({schemaname:'public',tablename:'accounts'}) }
  expect(() => assertCatalogChanges(before,wrong)).toThrow()
})
