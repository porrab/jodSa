import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'

// Service-role client — BYPASSES RLS. Trusted server-only use, exactly two
// purposes: (1) signing a short-lived Storage URL for the host bank QR on the
// guest /pay/<token> page, AFTER the open-session capability token has been
// validated through the anon client (so RLS gated the lookup); (2) deleting the
// caller's own auth user (self-deletion requires the admin API; identity is
// verified from the session first, cascade wipes all rows). Never import from
// client code and never use it to read/write user rows on a request path.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
