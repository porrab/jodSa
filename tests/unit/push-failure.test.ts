import { expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { pushFailure } from '@/lib/notifications/web-push'
it('reports a thrown Error without statusCode using a redacted bounded message', () => {
  vi.stubEnv('VAPID_PRIVATE_KEY', 'secret-vapid')
  try {
    const result = pushFailure(new Error('Network failed for https://push.example/device secret-vapid device-auth ' + 'x'.repeat(250)), ['device-auth'])
    expect(result.statusCode).toBeNull()
    expect(result.body).toContain('Network failed')
    expect(result.body).not.toMatch(/https:|push.example|secret-vapid|device-auth/)
    expect(result.body).toHaveLength(200)
  } finally { vi.unstubAllEnvs() }
})
