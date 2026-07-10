// Test-only stub. Next.js's bundler resolves the bare `import 'server-only'`
// specifier to an internal guard during `next build`/`next dev` without it being
// an installed npm package; Vitest (Vite-based, not webpack) has no such built-in
// resolution, so `vitest.config.ts` aliases the specifier here for unit tests that
// import server-only modules (e.g. lib/recurrence/materialize.ts). No-op on
// purpose — the guard's job (fail a client-side bundle) doesn't apply in Node/tests.
export {}
