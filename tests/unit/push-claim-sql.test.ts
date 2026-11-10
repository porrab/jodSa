import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
it('keeps the claim RPC parameters distinct from auth schema and columns', () => {
  const sql = readFileSync('db/migrations/0014_push_notifications.sql', 'utf8')
  expect(sql).toContain('claim_push_subscription(p_endpoint text, p_p256dh text, p_auth text)')
  expect(sql).toContain('values (auth.uid(), p_endpoint, p_p256dh, p_auth)')
  expect(sql).not.toMatch(/\$[123]/)
  expect(sql).toContain('security definer set search_path = public')
})
