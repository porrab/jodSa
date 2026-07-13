/**
 * Canonical origin for building absolute redirect URLs that leave the app and
 * come back — e.g. the Supabase `emailRedirectTo` used for signup confirmation.
 *
 * Resolution order (first truthy value wins):
 *   1. NEXT_PUBLIC_SITE_URL   — set explicitly per environment. Point it at the
 *      real production domain on Vercel, and `http://localhost:3000` in `.env.local`.
 *   2. NEXT_PUBLIC_VERCEL_URL — auto-exposed by Vercel per deployment; covers
 *      preview deploys whose domain isn't known ahead of time.
 *   3. http://localhost:3000  — local-dev fallback.
 *
 * Always returns an absolute origin (protocol present, no trailing slash) so a
 * caller can append a path directly: `${getSiteURL()}/auth/callback`.
 *
 * NOTE: whatever this resolves to in production must ALSO be listed under
 * Supabase → Authentication → URL Configuration → Redirect URLs, otherwise
 * Supabase ignores it and falls back to the dashboard Site URL.
 */
export function getSiteURL(): string {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : '') ||
    'http://localhost:3000'

  // A bare host (e.g. from NEXT_PUBLIC_VERCEL_URL) needs a protocol.
  if (!url.startsWith('http')) url = `https://${url}`
  // Drop any trailing slash so path concatenation stays clean.
  return url.replace(/\/+$/, '')
}
