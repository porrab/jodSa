import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
it('pins the write-only Broadcast migration and keeps trigger-only minimal private sends', () => {
  const sql = readFileSync('db/migrations/0016_realtime_broadcast.sql','utf8')
  const script = readFileSync('scripts/apply-0016-approved.cjs','utf8')
  expect(script).toContain(createHash('sha256').update(sql).digest('hex'))
  expect(sql).toContain("jsonb_build_object('table', TG_TABLE_NAME, 'op', TG_OP, 'id', row_id)")
  expect(sql).toContain("realtime.send(message, TG_OP, 'user:' || old_owner::text, true)")
  expect(sql).toContain("realtime.send(message, TG_OP, 'user:' || new_owner::text, true)")
  expect(sql.match(/exception when others then null/g)).toHaveLength(2)
  expect(sql).toContain("security definer set search_path = ''")
  expect(sql).toContain('from public, anon, authenticated')
  expect(sql).not.toMatch(/create policy[^;]*for insert/i)
  expect(script).toContain('REALTIME_SEND_SIGNATURE_MISSING')
  expect(script).toContain('REALTIME_SEND_ERROR_BEHAVIOUR_REQUIRES_REVIEW')
})
