export interface FieldConfidence<T> {
  value: T | null
  confidence: number // 0–1
}

// M8: the consumer app that produced the slip, when a recognizable signature
// is present in the OCR text. Distinguishes wallet/app accounts that share a
// single bank_code (e.g. a KTB bank account vs. the Paotang wallet) — see
// lib/slip/extract.ts detectSourceApp() and lib/account-map.ts.
export type SourceApp = 'paotang' | 'make' | 'kplus' | 'ktbnext' | 'ttb'

export interface ParsedSlip {
  amount: FieldConfidence<number>       // satang (integer)
  datetime: FieldConfidence<string>     // ISO 8601 with +07:00
  counterparty: FieldConfidence<string>
  refCode: FieldConfidence<string>      // from QR primarily
  bankCode: FieldConfidence<string>
  // M8: last visible digits of the SENDER's masked account number (e.g. TTB
  // "XXX-X-XX441-5" → "441-5"). Combined with bankCode + sourceApp into the
  // slip_account_map fingerprint and matched against accounts.number_hint.
  senderMask: FieldConfidence<string>
  // M8: detected source app, when a recognizable signature is present.
  sourceApp: FieldConfidence<SourceApp>
  suggestedType: 'income' | 'expense'
  rawTextDebug?: string                 // dev-only, never persisted
}

export interface WorkerParseMessage {
  buffer: ArrayBuffer
  mimeType: string
}

export type WorkerResponse =
  | { type: 'progress'; stage: string; percent: number }
  | { type: 'preprocessed'; buffer: ArrayBuffer; width: number; height: number; qrData: string | null }
  | { type: 'error'; message: string }
