/** Keep service-role setup queries tied to IDs obtained from test-account sessions. */
export const DISPOSABLE_TEST_EMAIL = /^qa-[a-z0-9-]+@jodsa\.test$/

export function requireDisposableTestEmail(email: string): string {
  const normalized = email.toLowerCase()
  if (!DISPOSABLE_TEST_EMAIL.test(normalized)) {
    throw new Error('Disposable test identity email must match qa-[a-z0-9-]+@jodsa.test')
  }
  return normalized
}

export function createTestUserGuard() {
  const knownIds = new Set<string>()

  return {
    register(userId: string): void {
      if (!userId) throw new Error('Cannot register a missing test-user id')
      knownIds.add(userId)
    },
    require(userId: string | null | undefined, operation: string): string {
      if (!userId || !knownIds.has(userId)) {
        throw new Error(`${operation} requires a registered test-user id`)
      }
      return userId
    },
  }
}
