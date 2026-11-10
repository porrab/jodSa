import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const legacy = new Set([
  'lib/supabase/admin.ts', 'app/actions/preferences.ts', 'app/pay/[token]/page.tsx',
  'app/api/sessions/[token]/expenses/route.ts', 'app/api/sessions/[token]/join/route.ts',
  'app/api/sessions/[token]/slips/route.ts', 'app/api/sessions/[token]/slips/[id]/confirm/route.ts',
  'lib/trip-server.ts', 'lib/trip-storage.ts',
])
function walk(dir: string): string[] { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]) }

describe('M10 service-role containment', () => {
  it('allows only frozen legacy importers and cron routes', () => {
    const files = ['app', 'lib', 'components'].flatMap((dir) => walk(path.join(root, dir)))
    const importers = files.filter((file) => /\.(ts|tsx)$/.test(file) && /createAdminClient|SUPABASE_SERVICE_ROLE_KEY/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(root, file).replaceAll('\\', '/'))
    for (const file of importers) expect(legacy.has(file) || file.startsWith('app/api/cron/')).toBe(true)
  })
})
