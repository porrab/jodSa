'use client'

/**
 * A template re-mounts on every navigation (unlike layout), so this wrapper
 * replays a subtle fade-up each time a route within (app) loads — a light
 * page transition. Honors prefers-reduced-motion via the .page-enter rule.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
