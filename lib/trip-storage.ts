// Server-only helpers for the per-payer trip QR images (bucket `trip-qr`).
// Anonymous participants have NO storage policy, so ALL trip-qr reads/writes go
// through the service-role admin client here — only ever called from server
// actions / API routes AFTER the caller's right to act has been validated.
import { createAdminClient } from '@/lib/supabase/admin'

const TRIP_QR_BUCKET = 'trip-qr'
const BANK_QR_BUCKET = 'bank-qr'
export const TRIP_QR_MAX_BYTES = 2 * 1024 * 1024

function extFor(type: string): string {
  return type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg'
}

function extFromPath(path: string): string {
  const m = path.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : 'png'
}

function contentTypeForExt(ext: string): string {
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
}

// Copy an owner's saved account QR (bucket bank-qr) into this expense's trip-qr
// object, so the expense QR is self-contained (survives later account edits and
// reuses the existing signTripQrUrl path). Caller must verify account ownership.
export async function copyAccountQrToTrip(
  accountQrPath: string,
  sessionId: string,
  expenseId: string,
): Promise<string> {
  const admin = createAdminClient()
  const { data: blob, error: dErr } = await admin.storage.from(BANK_QR_BUCKET).download(accountQrPath)
  if (dErr || !blob) throw new Error(dErr?.message ?? 'QR download failed')
  const ext = extFromPath(accountQrPath)
  const dest = `${sessionId}/${expenseId}.${ext}`
  const { error: uErr } = await admin.storage
    .from(TRIP_QR_BUCKET)
    .upload(dest, blob, { upsert: true, contentType: contentTypeForExt(ext) })
  if (uErr) throw new Error(uErr.message)
  return dest
}

export async function uploadTripQr(sessionId: string, expenseId: string, file: File): Promise<string> {
  const path = `${sessionId}/${expenseId}.${extFor(file.type)}`
  const admin = createAdminClient()
  const { error } = await admin.storage
    .from(TRIP_QR_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw new Error(error.message)
  return path
}

export async function removeTripQr(path: string): Promise<void> {
  const admin = createAdminClient()
  await admin.storage.from(TRIP_QR_BUCKET).remove([path])
}

export async function signTripQrUrl(path: string | null): Promise<string | null> {
  if (!path) return null
  const admin = createAdminClient()
  const { data } = await admin.storage.from(TRIP_QR_BUCKET).createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
