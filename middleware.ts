import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { createRateLimiter } from '@/lib/rate-limit'

const GUEST_SLIP_POST = /^\/api\/sessions\/([^/]+)\/slips$/
const checkRateLimit = createRateLimiter(10, 60_000)

export async function middleware(request: NextRequest) {
  // Rate-limit guest slip POSTs by IP + token (RLS cannot rate-limit)
  if (request.method === 'POST') {
    const match = request.nextUrl.pathname.match(GUEST_SLIP_POST)
    if (match) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
      if (!checkRateLimit(`${ip}:${match[1]}`)) {
        return NextResponse.json(
          { error: 'Too many requests' },
          { status: 429, headers: { 'Retry-After': '60' } },
        )
      }
      // Guest endpoint is anonymous by design — skip the auth cookie refresh
      return NextResponse.next({ request })
    }
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh session — must not use getSession() here (use getUser() for server-side auth)
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
