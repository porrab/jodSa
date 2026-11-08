import { describe, expect, it } from 'vitest'
import { createTestUserGuard, requireDisposableTestEmail } from '../e2e/helpers/test-user-guard'
import { resetAllUserData, testUserClient } from '../e2e/helpers/admin'

describe('test-user query guard', () => {
  it('rejects an email outside the disposable qa-* identity namespace', () => {
    expect(() => requireDisposableTestEmail('owner@example.com')).toThrow(/Disposable test identity email/i)
    expect(() => requireDisposableTestEmail('qa_invalid@jodsa.test')).toThrow(/Disposable test identity email/i)
    expect(requireDisposableTestEmail('QA-M5-DEL-123@JODSA.TEST')).toBe('qa-m5-del-123@jodsa.test')
  })

  it('rejects a missing or unregistered user id before a query is built', () => {
    const guard = createTestUserGuard()
    expect(() => guard.require(undefined, 'transactions read')).toThrow(/test-user id/i)
    expect(() => guard.require('', 'transactions read')).toThrow(/test-user id/i)
    expect(() => guard.require('owner-id', 'transactions read')).toThrow(/test-user id/i)
  })

  it('accepts only an id registered from a test-user session or creation', () => {
    const guard = createTestUserGuard()
    guard.register('test-user-a-id')
    expect(guard.require('test-user-a-id', 'transactions read')).toBe('test-user-a-id')
    expect(() => guard.require('test-user-b-id', 'transactions read')).toThrow(/test-user id/i)
  })

  it('blocks a service-role query helper and a session client without a test-user id', async () => {
    await expect(resetAllUserData(undefined as unknown as string)).rejects.toThrow(/test-user id/i)
    await expect(testUserClient(undefined as unknown as string)).rejects.toThrow(/test-user id/i)
  })
})
