/** Keep service-role setup queries tied to IDs obtained from test-account sessions. */
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
