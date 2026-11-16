import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('preserves both daily notification cron entries in Vercel', () => {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  expect(config.crons).toEqual([
    { path: '/api/cron/notify', schedule: '0 5 * * *' },
    { path: '/api/cron/notify', schedule: '0 15 * * *' },
  ])
})
