# 05 — Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Free OCR not accurate enough on Thai slips | High | High | QR is the primary key for ref_code; OCR + **mandatory user confirmation**; target 90% not 100%; preprocess (downscale/grayscale/contrast); open BYO-vision path in Phase 2 |
| Slip QR carries only a reference, not the amount | High | Medium | Design so OCR extracts the amount; QR used only for ref_code/dedup — never depended on for amount |
| Tesseract WASM + Thai traineddata large/slow on mobile | Medium | Medium | lazy-load in Web Worker; cache WASM + traineddata in service worker; downscale image before OCR; show progress |
| RLS misconfigured → cross-user data leak | Medium | **Critical** | `supabase-rls` skill + deny-by-default; 2-user isolation test in M1; **never** use service-role/Drizzle at runtime for user data |
| Guest endpoint spammed with junk slips | Medium | Medium | middleware rate-limit by IP + token; session expires/closes; Zod-validate payload; anon insert only while session open |
| iOS does not support Web Share Target | High | Low | tell the user up front; in-app upload button is the primary iOS path (same flow) |
| Recurrence + timezone bugs (month/year cross, weekday exclusions) | Medium | Medium | force Asia/Bangkok; idempotent generation; test edge cases in the recurrence-engine skill |
| Float rounding corrupts money | Medium | High | store money as **integer satang** end-to-end; convert to baht only at display |
| Guest payment recorded but not verified (fraud surface) | Medium | Medium | frame UI as "recorded, not verified"; host can confirm/unconfirm each slip; real verification (bank API) is out of scope |
| Null ref_code defeats the unique dedup index | Medium | Medium | soft-dedup heuristic (same account + amount + datetime within N min → warn) for null-ref rows |
| Supabase free-tier pause + size caps | Medium | Medium | OK for portfolio/demo; for real shared use add keep-alive ping or paid tier; Storage limited to 1 GB (host QR images only) |
| Scope creep (investment, multi-currency, real-time) | High | Medium | non-goals enforced; push everything else to Phase 2 |
